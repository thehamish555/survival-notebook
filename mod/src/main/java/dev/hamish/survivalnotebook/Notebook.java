package dev.hamish.survivalnotebook;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/** Cached copy of the selected notebook plus every action that writes back to it. State is volatile; writes run on the sync thread. */
final class Notebook {
	private Notebook() { }

	static volatile String status = "Not connected", userId = "", title = "", role = "";
	static volatile boolean ok, live;
	static volatile JsonObject sections = new JsonObject();
	static volatile JsonArray members = new JsonArray(), notebooks = new JsonArray(), activity = new JsonArray();
	static volatile long lastGearSync;
	static volatile int version;   // bumps whenever something changed, so open screens know to redraw

	private static final Map<String, String> NEXT = Map.of("To-Do", "In Progress", "In Progress", "Done", "Done", "To-Do");

	interface Job { void run() throws Api.ApiException; }

	static void bump() { version++; }
	static void setLive(boolean v) { if (live != v) { live = v; bump(); } }
	static boolean canEdit() { return ok && !role.equals("viewer"); }

	static String str(JsonObject o, String k) { return o.has(k) && o.get(k).isJsonPrimitive() ? o.get(k).getAsString() : ""; }
	static boolean bool(JsonObject o, String k) { return o.has(k) && o.get(k).isJsonPrimitive() && o.get(k).getAsBoolean(); }

	static void msg(String text) {
		Minecraft mc = Minecraft.getInstance();
		mc.execute(() -> { if (mc.player != null) mc.player.sendSystemMessage(Component.literal("[Survival Notebook] " + text)); });
	}

	private static void job(Job j) {
		Api.EXEC.execute(() -> {
			try { j.run(); }
			catch (Api.ApiException e) { if (e.status == 401) ok = false; status = e.getMessage(); bump(); msg(e.getMessage()); }
			catch (RuntimeException e) { status = "Unexpected error: " + e.getMessage(); bump(); }
		});
	}

	private static void requireNotebook(NbConfig c) throws Api.ApiException {
		if (c.notebookId.isBlank()) throw new Api.ApiException(0, "Pick a notebook in Settings");
		if (role.equals("viewer")) throw new Api.ApiException(403, "You have view-only access to this notebook");
	}

	// ---- reading

	static JsonArray list(String name) {
		JsonObject s = sections;
		JsonObject o = s.has(name) && s.get(name).isJsonObject() ? s.getAsJsonObject(name) : null;
		return o != null && o.has("data") && o.get("data").isJsonArray() ? o.getAsJsonArray("data") : new JsonArray();
	}

	static List<JsonObject> rows(String name) {
		List<JsonObject> out = new ArrayList<>();
		for (JsonElement e : list(name)) if (e.isJsonObject()) out.add(e.getAsJsonObject());
		return out;
	}

	static JsonObject find(String section, String id) {
		for (JsonObject o : rows(section)) if (str(o, "id").equals(id)) return o;
		return null;
	}

	static String notes() {
		JsonObject s = sections;
		JsonObject o = s.has("notes") && s.get("notes").isJsonObject() ? s.getAsJsonObject("notes") : null;
		return o != null && o.has("data") && o.get("data").isJsonPrimitive() ? o.get("data").getAsString() : "";
	}

	static List<JsonObject> gear(String uid) { return rows("gear:" + uid); }

	static List<JsonObject> memberList() {
		List<JsonObject> out = new ArrayList<>();
		for (JsonElement e : members) if (e.isJsonObject()) out.add(e.getAsJsonObject());
		return out;
	}

	static String memberName(String id) {
		for (JsonObject m : memberList()) if (str(m, "id").equals(id)) return str(m, "name");
		return "";
	}

	static JsonObject self() {
		for (JsonObject m : memberList()) if (str(m, "id").equals(userId)) return m;
		return null;
	}

	static void refresh() { job(Notebook::load); }

	private static void load() throws Api.ApiException {
		NbConfig c = NbConfig.get();
		if (!c.connected()) { ok = false; status = "Not linked yet: press Link this game on Home"; bump(); return; }
		if (userId.isEmpty()) userId = Api.me().get("id").getAsString();
		if (c.notebookId.isBlank()) { ok = false; status = "Pick a notebook in Settings"; bump(); return; }
		JsonObject r = Api.notebook(c.notebookId);
		title = str(r.getAsJsonObject("notebook"), "title");
		role = r.get("role").getAsString();
		sections = r.getAsJsonObject("sections");
		members = r.getAsJsonArray("members");
		try { activity = Api.ok(Api.call("GET", "/notebooks/" + c.notebookId + "/activity", null)).body().getAsJsonArray(); } catch (Api.ApiException ignored) { }
		ok = true;
		status = role.equals("viewer") ? "View only" : "Connected";
		bump();
		syncIdentity();
	}

	private static String lastIdentity = "";

	/** Saves your Minecraft UUID and username on your member entry so friends' games can show your skin. */
	private static void syncIdentity() {
		String[] a = Compat.account();
		if (a == null || !canEdit()) return;
		List<JsonObject> have = rows("prefs:" + userId);
		JsonObject cur = have.isEmpty() ? new JsonObject() : have.get(0);
		if (a[0].equals(str(cur, "mcUuid")) && a[1].equals(str(cur, "mcName"))) return;
		String sig = a[0] + a[1];
		if (sig.equals(lastIdentity)) return;
		lastIdentity = sig;
		JsonObject row = cur.deepCopy();
		if (!row.has("id")) row.addProperty("id", "me");
		row.addProperty("mcUuid", a[0]); row.addProperty("mcName", a[1]);
		NbConfig c = NbConfig.get();
		Api.EXEC.execute(() -> { try { Api.mutate(c.notebookId, "prefs:" + userId, old -> { JsonArray arr = new JsonArray(); arr.add(row); return arr; }); } catch (Api.ApiException ignored) { } });
	}

	/** {uuid, name} of a member's Minecraft account if their game has synced it, else null. */
	static String[] mcOf(String memberId) {
		List<JsonObject> r = rows("prefs:" + memberId);
		return r.isEmpty() || str(r.get(0), "mcUuid").isBlank() ? null : new String[] {str(r.get(0), "mcUuid"), str(r.get(0), "mcName")};
	}

	/** Re-reads your notebooks and makes sure one is selected. Call after the URL or token changes. */
	static void connect() {
		job(() -> {
			userId = "";
			NbConfig c = NbConfig.get();
			if (!c.connected()) { load(); return; }
			JsonArray all = Api.notebooks();
			notebooks = all;
			boolean found = false;
			for (JsonElement e : all) if (str(e.getAsJsonObject(), "id").equals(c.notebookId)) found = true;
			if (!found) {
				JsonObject first = all.size() > 0 ? all.get(0).getAsJsonObject() : null;
				c.notebookId = first == null ? "" : str(first, "id");
				c.notebookTitle = first == null ? "" : str(first, "title");
				NbConfig.save();
			}
			Live.restart();
			load();
		});
	}

	/** On joining a world or server: use its notebook (remembered, else same title), or make one named after it. Silent. */
	static void joinWorld(String name) {
		NbConfig c = NbConfig.get();
		if (name == null || name.isBlank() || !c.worldNotebooks || !c.connected()) return;
		String key = name.toLowerCase();
		job(() -> {
			JsonArray all = Api.notebooks(); notebooks = all;
			String id = c.worlds.get(key), title = name;
			boolean have = false;
			if (id != null) for (JsonElement e : all) if (str(e.getAsJsonObject(), "id").equals(id)) { have = true; title = str(e.getAsJsonObject(), "title"); }
			if (!have) {
				id = null;
				for (JsonElement e : all) if (str(e.getAsJsonObject(), "title").equalsIgnoreCase(name)) { id = str(e.getAsJsonObject(), "id"); title = str(e.getAsJsonObject(), "title"); break; }
				if (id == null) { id = Api.createNotebook(name.length() > 80 ? name.substring(0, 80) : name); notebooks = Api.notebooks(); }
				c.worlds.put(key, id); NbConfig.save();
			}
			if (!id.equals(c.notebookId)) pickNotebook(id, title);
		});
	}

	static void pickNotebook(String id, String name) {
		NbConfig c = NbConfig.get();
		c.notebookId = id; c.notebookTitle = name; NbConfig.save();
		role = ""; MapRecorder.reset(); InventoryScanner.ender = null; Live.restart(); refresh();
	}

	// ---- generic row editing (places, to-dos, farms, your own gear)

	/** Inserts the row, or merges its fields into the existing row with the same id (unknown fields such as an attached file are kept). */
	static void saveRow(String section, JsonObject draft) {
		NbConfig c = NbConfig.get();
		String id = str(draft, "id");
		job(() -> {
			requireNotebook(c);
			Api.mutate(c.notebookId, section, a -> {
				for (JsonElement e : a) {
					if (e.isJsonObject() && str(e.getAsJsonObject(), "id").equals(id)) {
						for (var f : draft.entrySet()) e.getAsJsonObject().add(f.getKey(), f.getValue());
						return a;
					}
				}
				a.add(draft.deepCopy());
				return a;
			});
			load();
			Minecraft.getInstance().execute(Compat::soundSaved);
			if (section.equals("farms")) fillVideoTitle(c.notebookId, id);
		});
	}

	static void deleteRow(String section, String id) {
		NbConfig c = NbConfig.get();
		job(() -> {
			requireNotebook(c);
			Api.mutate(c.notebookId, section, a -> {
				JsonArray out = new JsonArray();
				for (JsonElement e : a) if (!(e.isJsonObject() && str(e.getAsJsonObject(), "id").equals(id))) out.add(e);
				return out;
			});
			load();
			Minecraft.getInstance().execute(Compat::soundDeleted);
		});
	}

	/** Moves a row to where another row is (drag and drop); the order is shared with the website. */
	static void moveRow(String section, String fromId, String toId) {
		NbConfig c = NbConfig.get();
		job(() -> {
			requireNotebook(c);
			Api.mutate(c.notebookId, section, a -> {
				List<JsonElement> l = new ArrayList<>();
				a.forEach(l::add);
				int f = -1, t = -1;
				for (int i = 0; i < l.size(); i++) { if (!l.get(i).isJsonObject()) continue; String id = str(l.get(i).getAsJsonObject(), "id"); if (id.equals(fromId)) f = i; if (id.equals(toId)) t = i; }
				if (f < 0 || t < 0) return a;
				l.add(t, l.remove(f));
				JsonArray out = new JsonArray();
				l.forEach(out::add);
				return out;
			});
			load();
		});
	}

	static void patchRow(String section, String id, Consumer<JsonObject> change) {
		NbConfig c = NbConfig.get();
		job(() -> {
			requireNotebook(c);
			Api.mutate(c.notebookId, section, a -> { for (JsonElement e : a) if (e.isJsonObject() && str(e.getAsJsonObject(), "id").equals(id)) change.accept(e.getAsJsonObject()); return a; });
			load();
		});
	}

	/** Like the website: a farm with a YouTube link gets the video's title, and is named after it if it has no name yet. */
	private static void fillVideoTitle(String nb, String id) throws Api.ApiException {
		JsonObject f = find("farms", id);
		if (f == null) return;
		String url = str(f, "tutorial");
		if (Names.ytId(url) == null || !str(f, "ttl").isBlank()) return;
		String t = Api.youtubeTitle(url);
		if (t.isBlank()) return;
		Api.mutate(nb, "farms", a -> {
			for (JsonElement e : a) {
				if (!e.isJsonObject() || !str(e.getAsJsonObject(), "id").equals(id)) continue;
				JsonObject o = e.getAsJsonObject();
				if (!str(o, "tutorial").equals(url)) continue;   // edited again meanwhile
				o.addProperty("ttl", t);
				if (str(o, "name").isBlank()) o.addProperty("name", t);
			}
			return a;
		});
		load();
	}

	// ---- quick actions

	private static int prio(String p) { return switch (p) { case "High" -> 0; case "Medium" -> 1; default -> 2; }; }

	static List<JsonObject> todoList(boolean mineOnly, boolean showDone) {
		List<JsonObject> out = new ArrayList<>();
		for (JsonObject o : rows("todos")) {
			if (!str(o, "auto").isEmpty()) continue;   // the stored marker for the automatic farm to-do is never listed itself
			if (!showDone && str(o, "progress").equals("Done")) continue;
			boolean forMe = userId.equals(str(o, "assignee")) || memberName(str(o, "assignee")).isEmpty() || !str(o, "auto").isEmpty();   // unassigned = all users; the auto farm to-do is for everyone
			if (mineOnly && !forMe) continue;
			out.add(o);
		}
		out.sort(Comparator.comparingInt((JsonObject o) -> str(o, "progress").equals("Done") ? 1 : 0));   // finished last; otherwise your own (draggable) order
		return out;
	}

	/** The automatic farm to-do (shown as its own section above the list), or null if off / finished and done items are hidden. */
	static JsonObject farmSection(boolean showDone) {
		JsonObject f = farmTodo();
		return f == null || (!showDone && str(f, "progress").equals("Done")) ? null : f;
	}

	static void cycleTodo(String id) { patchRow("todos", id, o -> o.addProperty("progress", NEXT.getOrDefault(str(o, "progress"), "To-Do"))); }

	static JsonObject placeRow(String name, String cat, Names.Spot spot) {
		JsonObject row = new JsonObject();
		row.addProperty("id", Names.newId());
		row.addProperty("name", name); row.addProperty("cat", cat);
		row.addProperty("ow", spot.dim().equals("ow") ? spot.xyz() : "");
		row.addProperty("nether", spot.dim().equals("nether") ? spot.xyz() : "");
		row.addProperty("end", spot.dim().equals("end") ? spot.xyz() : "");
		row.addProperty("portal", "No Portal");
		return row;
	}

	static void savePlace(String name, String cat, Names.Spot spot) {
		JsonObject row = placeRow(name, cat, spot);
		saveRow("coords", row);
		msg("Saved “" + name + "” at " + spot.xyz());
	}

	/** Replaces the mod-managed items in your gear list; anything you added by hand on the website is kept. */
	static void syncGear(JsonArray mine, boolean announce) {
		NbConfig c = NbConfig.get();
		job(() -> {
			requireNotebook(c);
			if (userId.isEmpty()) userId = Api.me().get("id").getAsString();
			boolean wrote = Api.mutate(c.notebookId, "gear:" + userId, old -> GearMerge.merge(old, mine));
			lastGearSync = System.currentTimeMillis();
			load();
			if (announce) msg(wrote ? "Synced " + mine.size() + " enchanted item(s)" : "Gear already up to date");
		});
	}

	/** Your nickname in this notebook (blank = use your account name). */
	static void setNick(String nick) {
		NbConfig c = NbConfig.get();
		job(() -> {
			if (c.notebookId.isBlank()) throw new Api.ApiException(0, "Pick a notebook in Settings");
			JsonObject body = new JsonObject();
			body.addProperty("nick", nick.trim());
			Api.ok(Api.call("PATCH", "/notebooks/" + c.notebookId + "/nick", body));
			load();
		});
	}

	static void touch() { bump(); }

	// ---- your gear: per-item switches, goals, planned items

	static void patchGear(String id, Consumer<JsonObject> change) { patchRow("gear:" + userId, id, change); }

	private static JsonObject obj(JsonObject o, String k) {
		if (!o.has(k) || !o.get(k).isJsonObject()) o.add(k, new JsonObject());
		return o.getAsJsonObject(k);
	}

	/** Switches an enchant off for ONE item (it turns red and stops counting), or back on. */
	static void toggleOff(String id, String key) {
		patchGear(id, o -> {
			JsonArray cur = o.has("off") && o.get("off").isJsonArray() ? o.getAsJsonArray("off") : new JsonArray(), next = new JsonArray();
			boolean had = false;
			for (JsonElement e : cur) if (e.getAsString().equals(key)) had = true; else next.add(e);
			if (!had) next.add(key);
			o.add("off", next);
		});
	}

	/** Other items of yours that still need this enchant (off=true) or have it switched off (off=false). */
	static List<String> othersWith(String exceptId, String key, boolean off) {
		List<String> ids = new ArrayList<>();
		for (JsonObject it : gear(userId)) {
			if (str(it, "id").equals(exceptId)) continue;
			Enchants.Result r = Enchants.analyseItem(it);
			for (Enchants.Missing m : off ? r.missing() : r.off()) if (m.key().equals(key)) { ids.add(str(it, "id")); break; }
		}
		return ids;
	}

	/** Switches one enchant off (or back on) for all the given items at once. Not tied to the single toggle. */
	static void setOffMany(List<String> ids, String key, boolean off) {
		NbConfig c = NbConfig.get();
		job(() -> {
			requireNotebook(c);
			Api.mutate(c.notebookId, "gear:" + userId, a -> {
				for (JsonElement e : a) {
					if (!e.isJsonObject() || !ids.contains(str(e.getAsJsonObject(), "id"))) continue;
					JsonObject o = e.getAsJsonObject();
					JsonArray cur = o.has("off") && o.get("off").isJsonArray() ? o.getAsJsonArray("off") : new JsonArray(), next = new JsonArray();
					for (JsonElement x : cur) if (!x.getAsString().equals(key)) next.add(x);
					if (off) next.add(key);
					o.add("off", next);
				}
				return a;
			});
			load();
		});
	}

	static void setGoal(String id, String enchantName, int level) { patchGear(id, o -> obj(o, "goal").addProperty(enchantName, level)); }

	static void dropGoal(String id, String enchantName) {
		patchGear(id, o -> { obj(o, "goal").remove(enchantName); if (bool(o, "plan")) obj(o, "enchants").remove(enchantName); });
	}

	static void setAlias(String id, String alias) { patchGear(id, o -> o.addProperty("alias", alias.trim())); }

	/** "Something I want to make": a planned item that merges into the real one when it shows up in your inventory. */
	static void planItem(String itemPath, String name) {
		JsonObject row = new JsonObject();
		row.addProperty("id", Names.newId()); row.addProperty("name", name); row.addProperty("item", itemPath); row.addProperty("icon", itemPath);
		row.add("enchants", new JsonObject()); row.add("goal", new JsonObject()); row.addProperty("plan", true);
		saveRow("gear:" + userId, row);
	}

	// ---- player stats (your own vanilla statistics, see PlayerStats)

	private static String lastStats = "";

	static void syncStats(JsonObject row) {
		NbConfig c = NbConfig.get();
		if (!canEdit() || !c.shareStats) return;
		String sig = row.deepCopy().toString().replaceAll("\"ts\":\\d+,?", "");   // an unchanged stats file isn't re-sent
		if (sig.equals(lastStats)) return;
		lastStats = sig;
		job(() -> {
			requireNotebook(c);
			Api.mutate(c.notebookId, "stats:" + userId, old -> { JsonArray a = new JsonArray(); a.add(row); return a; });
		});
	}

	// ---- inventory snapshot for the website's shopping list (see InventoryScanner)

	private static String lastInv = "";

	static void syncInventory(JsonObject row) {
		NbConfig c = NbConfig.get();
		if (row == null || !canEdit() || !c.shareInventory) return;
		JsonObject sigRow = row.deepCopy(); sigRow.remove("ts");
		String sig = c.notebookId + sigRow;   // only sent when something changed
		if (sig.equals(lastInv)) return;
		lastInv = sig;
		job(() -> {
			requireNotebook(c);
			if (userId.isEmpty()) userId = Api.me().get("id").getAsString();
			Api.mutate(c.notebookId, "inv:" + userId, old -> { JsonArray a = new JsonArray(); a.add(row); return a; });
		});
	}

	// ---- notes (one free-text document, edited here line by line)

	static void saveNotes(String text) {
		NbConfig c = NbConfig.get();
		JsonObject s = sections.deepCopy();
		JsonObject n = s.has("notes") && s.get("notes").isJsonObject() ? s.getAsJsonObject("notes") : new JsonObject();
		n.addProperty("data", text); s.add("notes", n);
		sections = s; bump();   // show it right away; the server copy follows
		job(() -> {
			requireNotebook(c);
			for (int i = 0; i < 4; i++) {
				JsonObject cur = Api.ok(Api.call("GET", "/notebooks/" + c.notebookId + "/s/notes", null)).obj();
				JsonObject body = new JsonObject();
				body.addProperty("data", text); body.addProperty("baseRev", cur.get("rev").getAsInt());
				Api.Res r = Api.call("PUT", "/notebooks/" + c.notebookId + "/s/notes", body);
				if (r.status() == 409) continue;
				Api.ok(r);
				break;
			}
			load();
		});
	}

	// ---- farms: the automatic "Build farms - N" to-do. It is never stored: it's worked out from the farms' remaining count (read-only).
	// A stored row only remembers whether you switched it off.

	static boolean autoFarmsOn() {
		for (JsonObject t : rows("todos")) if (str(t, "auto").equals("farms")) return !t.has("on") || bool(t, "on");
		return true;   // on by default
	}

	/** The read-only "Build farms - N" row (id "auto-farms"), or null when switched off. */
	static JsonObject farmTodo() {
		if (!autoFarmsOn()) return null;
		int left = 0; boolean building = false;
		for (JsonObject f : rows("farms")) if (!bool(f, "built")) { left++; building |= bool(f, "building"); }
		JsonObject o = new JsonObject();
		o.addProperty("id", "auto-farms"); o.addProperty("auto", "farms"); o.addProperty("virtual", true); o.addProperty("icon", "hopper");
		o.addProperty("project", "Build farms - " + left); o.addProperty("priority", "Medium"); o.addProperty("assignee", "");
		o.addProperty("progress", left == 0 ? "Done" : building ? "In Progress" : "To-Do");
		return o;
	}

	static void toggleAutoFarms() {
		NbConfig c = NbConfig.get();
		final boolean next = !autoFarmsOn();
		job(() -> {
			requireNotebook(c);
			Api.mutate(c.notebookId, "todos", a -> {
				for (JsonElement e : a) if (e.isJsonObject() && str(e.getAsJsonObject(), "auto").equals("farms")) { e.getAsJsonObject().addProperty("on", next); return a; }
				JsonObject o = new JsonObject();
				o.addProperty("id", "auto-farms"); o.addProperty("auto", "farms"); o.addProperty("on", next); o.addProperty("project", "Build farms"); o.addProperty("priority", "Medium");
				o.addProperty("progress", "To-Do"); o.addProperty("assignee", ""); o.addProperty("notes", "");
				a.add(o);
				return a;
			});
			load();
		});
	}

	// ---- minimap auto-sync (see Minimap.apply)

	private static volatile long mmLast;
	private static volatile boolean mmBusy;

	/** Called every few seconds: if the chosen minimap's files changed, mirrors them into your places. Cheap when nothing changed. */
	static void minimapTick() {
		NbConfig c = NbConfig.get();
		if (c.mmDir.isBlank() || !canEdit() || mmBusy) return;
		mmBusy = true;
		Api.EXEC.execute(() -> {
			try {
				java.nio.file.Path dir = java.nio.file.Path.of(c.mmDir);
				if (!java.nio.file.Files.isDirectory(dir)) return;
				long m = Minimap.newest(c.mmApp.equals("JourneyMap") ? dir.resolve("waypoints") : dir);
				if (m == mmLast || System.currentTimeMillis() - m < 1500) return;   // unchanged, or the minimap is still writing
				List<Minimap.Wp> wps = Minimap.read(new Minimap.Source(c.mmApp, "", dir, 0, m));
				if (wps.isEmpty() && !c.mmSeen.isEmpty()) return;                   // an empty read is more likely a half-written file than "deleted everything"
				boolean[] changed = {false};
				Api.mutate(c.notebookId, "coords", a -> { changed[0] = Minimap.apply(a, wps, c.mmSeen); return a; });
				NbConfig.save();
				mmLast = m;
				if (changed[0]) load();
			} catch (Api.ApiException e) { status = e.getMessage(); bump(); }
			catch (RuntimeException ignored) { }
			finally { mmBusy = false; }
		});
	}

	static void startMinimapSync(Minimap.Source src) {
		NbConfig c = NbConfig.get();
		c.mmDir = src.dir().toString(); c.mmApp = src.app(); c.mmSeen = new ArrayList<>(); NbConfig.save();
		mmLast = 0;
		msg("Syncing places with " + src.app() + " · " + src.world());
		minimapTick();
	}

	static void stopMinimapSync() { NbConfig c = NbConfig.get(); c.mmDir = ""; c.mmApp = ""; c.mmSeen = new ArrayList<>(); NbConfig.save(); bump(); }

	// ---- deaths

	static void recordDeath(JsonObject row) {
		NbConfig c = NbConfig.get();
		saveRow("deaths", row);
		if (c.autoTrackDeath) { c.trackedPlace = str(row, "id"); NbConfig.save(); }
		msg("Death recorded at " + (row.has("ow") && !str(row, "ow").isEmpty() ? str(row, "ow") : !str(row, "nether").isEmpty() ? "Nether " + str(row, "nether") : "End " + str(row, "end")) + (c.autoTrackDeath ? ". Tracking it." : ""));
	}

	// ---- members (owner only)

	static void addMember(String email, String role, Runnable done) {
		NbConfig c = NbConfig.get();
		job(() -> {
			if (!role().equals("owner")) throw new Api.ApiException(403, "Only the owner can invite people");
			JsonObject body = new JsonObject();
			body.addProperty("email", email.trim()); body.addProperty("role", role);
			Api.ok(Api.call("POST", "/notebooks/" + c.notebookId + "/members", body));
			load();
			msg("Added " + email.trim() + " as " + role);
			if (done != null) done.run();
		});
	}

	static void removeMember(String uid) {
		NbConfig c = NbConfig.get();
		job(() -> {
			Api.ok(Api.call("DELETE", "/notebooks/" + c.notebookId + "/members/" + uid, null));
			load();
			msg("Member removed");
		});
	}

	private static String role() { return role; }

	// ---- Litematica files

	/** Uploads a .litematic (max 100 KB) and attaches it to the farm. */
	static void attachFile(String farmId, java.nio.file.Path file, Consumer<JsonObject> done) {
		NbConfig c = NbConfig.get();
		job(() -> {
			requireNotebook(c);
			byte[] data;
			try { data = java.nio.file.Files.readAllBytes(file); } catch (java.io.IOException e) { throw new Api.ApiException(0, "Couldn't read " + file.getFileName()); }
			JsonObject rec = Api.upload(c.notebookId, file.getFileName().toString(), data);
			JsonObject f = new JsonObject();
			f.add("id", rec.get("id")); f.add("name", rec.get("name")); f.add("size", rec.get("size"));
			if (find("farms", farmId) != null) patchRow("farms", farmId, o -> o.add("file", f.deepCopy()));
			msg("Attached " + file.getFileName());
			if (done != null) done.accept(f);
		});
	}

	/** Removes an uploaded file nobody ended up using (cancelled farm). Errors are ignored: the server sweeps orphans anyway. */
	static void discardFile(String fileId) {
		NbConfig c = NbConfig.get();
		if (fileId.isBlank() || c.notebookId.isBlank()) return;
		Api.EXEC.execute(() -> { try { Api.deleteFile(c.notebookId, fileId); } catch (Api.ApiException ignored) { } });
	}

	private static String norm(String s) { return s.toLowerCase().replace("farm", "").replaceAll("[^a-z0-9]", ""); }

	/** Like the website: a farm with no place links to the place with the same name. */
	static void autoLink(JsonObject farm) {
		if (!str(farm, "place").isBlank() || norm(str(farm, "name")).isEmpty()) return;
		for (JsonObject p : rows("coords")) if (norm(str(p, "name")).equals(norm(str(farm, "name")))) { farm.addProperty("place", str(p, "id")); return; }
	}

	/** Saves a farm's attached file into the schematics folder (never overwrites: adds " (1)" etc.). */
	static void downloadFile(JsonObject file, java.nio.file.Path dir) {
		NbConfig c = NbConfig.get();
		job(() -> {
			byte[] data = Api.download(c.notebookId, str(file, "id"));
			try {
				java.nio.file.Files.createDirectories(dir);
				String name = str(file, "name").replaceAll("[\\\\/:*?\"<>|]", "_");
				java.nio.file.Path out = dir.resolve(name);
				for (int i = 1; java.nio.file.Files.exists(out); i++) out = dir.resolve(name.replaceFirst("(\\.litematic)?$", " (" + i + ")$1"));
				java.nio.file.Files.write(out, data);
				msg("Saved to " + dir.getFileName() + "/" + out.getFileName() + ". Load it in Litematica.");
			} catch (java.io.IOException e) { throw new Api.ApiException(0, "Couldn't save the file: " + e.getMessage()); }
		});
	}
}
