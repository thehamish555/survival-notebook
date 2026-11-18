package dev.hamish.survivalnotebook;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * The weekly recap, like the website's: what the team did in the last 7 days. Shown on the Home tab, and as a chat message on Sunday
 * from 7pm (your computer's time), once a week. Both follow the Weekly recap setting.
 */
final class Recap {
	private Recap() { }

	static volatile JsonObject week;
	private static volatile long fetched;
	private static volatile String forNotebook = "";
	private static volatile boolean busy;

	/** Loads this week's recap in the background, at most every 10 minutes unless forced. */
	static void refresh(boolean force) {
		NbConfig c = NbConfig.get();
		if (!c.weeklyRecap || !Notebook.ok || c.notebookId.isBlank() || busy) return;
		long now = System.currentTimeMillis();
		if (!force && c.notebookId.equals(forNotebook) && now - fetched < 600_000) return;
		busy = true; fetched = now;
		final String nb = c.notebookId;
		Api.EXEC.execute(() -> {
			try { week = Api.ok(Api.call("GET", "/notebooks/" + nb + "/recap", null)).obj(); forNotebook = nb; Notebook.bump(); }
			catch (Api.ApiException | RuntimeException ignored) { }
			finally { busy = false; }
		});
	}

	private static long num(JsonObject o, String k) { return o != null && o.has(k) && o.get(k).isJsonPrimitive() ? o.get(k).getAsLong() : 0; }

	static String hours(long ms) {
		long m = ms / 60_000, h = m / 60;
		return h > 0 ? h + "h " + (m % 60) + "m" : m + "m";
	}

	/** One line for the week, like "3h 20m played, 2 new places and 1 farm built", or "" if nothing happened. */
	static String line(JsonObject r) {
		JsonObject t = r == null || !r.has("totals") ? null : r.getAsJsonObject("totals");
		if (t == null) return "";
		List<String> bits = new ArrayList<>();
		if (num(t, "ms") >= 60_000) bits.add(hours(num(t, "ms")) + " played");
		long places = num(t, "places"), farms = num(t, "farms"), todos = num(t, "todos"), deaths = num(t, "deaths");
		if (places > 0) bits.add(places + " new place" + (places == 1 ? "" : "s"));
		if (farms > 0) bits.add(farms + " farm" + (farms == 1 ? "" : "s") + " built");
		if (todos > 0) bits.add(todos + " to-do" + (todos == 1 ? "" : "s") + " done");
		if (deaths > 0) bits.add(deaths + " death" + (deaths == 1 ? "" : "s"));
		if (bits.isEmpty()) return "";
		if (bits.size() == 1) return bits.get(0);
		return String.join(", ", bits.subList(0, bits.size() - 1)) + " and " + bits.get(bits.size() - 1);
	}

	/** The week's first highlight, like "Most time played: Alex", or "". */
	static String highlight(JsonObject r) {
		JsonArray h = r == null || !r.has("highlights") || !r.get("highlights").isJsonArray() ? null : r.getAsJsonArray("highlights");
		if (h == null || h.isEmpty()) return "";
		for (JsonElement e : h) {
			if (!e.isJsonObject()) continue;
			JsonObject o = e.getAsJsonObject();
			String label = Notebook.str(o, "label"), name = Notebook.str(o, "name");
			if (!label.isBlank() && !name.isBlank()) return label + ": " + name;
		}
		return "";
	}

	/** Called every few seconds in a world: on Sunday from 7pm, says how the week went in chat, once per week. */
	static void tick() {
		NbConfig c = NbConfig.get();
		if (!c.weeklyRecap || !Notebook.ok) return;
		LocalDateTime now = LocalDateTime.now();
		String today = LocalDate.now().toString();
		if (now.getDayOfWeek() != DayOfWeek.SUNDAY || now.getHour() < 19 || today.equals(c.recapSeen)) return;
		JsonObject r = week;
		if (r == null || !c.notebookId.equals(forNotebook) || System.currentTimeMillis() - fetched > 600_000) { refresh(true); return; }
		c.recapSeen = today; NbConfig.save();
		String l = line(r);
		if (!l.isEmpty()) Notebook.msg("Your week in " + (Notebook.title.isBlank() ? "your notebook" : Notebook.title) + ": " + l + ".");
	}
}
