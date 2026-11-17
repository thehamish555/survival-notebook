package dev.hamish.survivalnotebook;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.Stream;

/**
 * Finds waypoints saved by Xaero's Minimap / World Map and JourneyMap by reading their files on disk. That means it works with
 * any version of those mods and adds no dependency. Read-only: the minimap files are never modified.
 */
final class Minimap {
	private Minimap() { }

	record Wp(String name, String dim, String xyz) { }                       // dim: ow | nether | end
	record Source(String app, String world, Path dir, int count, long modified) { }

	/** All waypoint sets found under the game directory, newest first. */
	static List<Source> scan(Path gameDir) {
		List<Source> out = new ArrayList<>();
		for (Path worlds : List.of(gameDir.resolve("xaero").resolve("minimap"), gameDir.resolve("XaeroWaypoints"))) {
			for (Path w : children(worlds)) {
				if (!Files.isDirectory(w)) continue;
				List<Wp> wps = readXaero(w);
				if (!wps.isEmpty()) out.add(new Source("Xaero's", pretty(w.getFileName().toString()), w, wps.size(), newest(w)));
			}
		}
		for (String kind : new String[] {"mp", "sp"}) {
			for (Path w : children(gameDir.resolve("journeymap").resolve("data").resolve(kind))) {
				List<Wp> wps = readJourneyMap(w);
				if (!wps.isEmpty()) out.add(new Source("JourneyMap", pretty(w.getFileName().toString()), w, wps.size(), newest(w.resolve("waypoints"))));
			}
		}
		out.sort(Comparator.comparingLong(Source::modified).reversed());
		return out;
	}

	static List<Wp> read(Source s) { return s.app().equals("JourneyMap") ? readJourneyMap(s.dir()) : readXaero(s.dir()); }

	private static String pretty(String folder) { return folder.replaceFirst("^(Multiplayer|Singleplayer)_", "").replace('_', ' '); }

	private static List<Path> children(Path dir) {
		if (!Files.isDirectory(dir)) return List.of();
		try (Stream<Path> s = Files.list(dir)) { return s.toList(); } catch (IOException e) { return List.of(); }
	}

	static long newest(Path dir) {
		long best = 0;
		try (Stream<Path> s = Files.walk(dir, 3)) {
			for (Path p : (Iterable<Path>) s::iterator) best = Math.max(best, Files.getLastModifiedTime(p).toMillis());
		} catch (IOException | RuntimeException ignored) { }
		return best;
	}

	private static String num(String s) {
		try { return String.valueOf((int) Math.floor(Double.parseDouble(s.trim()))); } catch (NumberFormatException e) { return null; }
	}

	private static String xyz(String x, String y, String z) {
		String a = num(x), c = num(z), b = num(y);
		if (b == null) b = "64";   // Xaero's stores "~" for "no height"
		return a == null || c == null ? null : a + " " + b + " " + c;
	}

	/** Xaero's: xaero/minimap/&lt;world&gt;/dim%0|dim%-1|dim%1/*.txt, lines "waypoint:name:initials:x:y:z:color:disabled:type:set:…". */
	static List<Wp> readXaero(Path world) {
		List<Wp> out = new ArrayList<>();
		for (Path d : children(world)) {
			String n = d.getFileName().toString();
			String dim = n.equals("dim%0") ? "ow" : n.equals("dim%-1") ? "nether" : n.equals("dim%1") ? "end" : null;
			if (dim == null || !Files.isDirectory(d)) continue;
			for (Path f : children(d)) {
				if (!f.getFileName().toString().endsWith(".txt")) continue;
				try {
					for (String line : Files.readAllLines(f, StandardCharsets.UTF_8)) {
						if (!line.startsWith("waypoint:")) continue;
						String[] a = line.split(":", -1);
						if (a.length < 6) continue;
						if (a.length > 8 && a[8].trim().equals("1")) continue;   // type 1 = a death marker
						String pos = xyz(a[3], a[4], a[5]);
						String name = a[1].replace("§§", ":").trim();
						if (pos != null && !name.isEmpty()) out.add(new Wp(name, dim, pos));
					}
				} catch (IOException | RuntimeException ignored) { }
			}
		}
		return out;
	}

	/** JourneyMap: journeymap/data/{mp,sp}/&lt;world&gt;/waypoints/*.json with name, x, y, z and a "dimensions" list. */
	static List<Wp> readJourneyMap(Path world) {
		List<Wp> out = new ArrayList<>();
		for (Path f : children(world.resolve("waypoints"))) {
			if (!f.getFileName().toString().endsWith(".json")) continue;
			try {
				JsonObject o = JsonParser.parseString(Files.readString(f, StandardCharsets.UTF_8)).getAsJsonObject();
				if (o.has("type") && o.get("type").getAsString().equalsIgnoreCase("Death")) continue;
				String name = o.has("name") ? o.get("name").getAsString().trim() : "";
				if (name.isEmpty() || !o.has("x") || !o.has("z")) continue;
				String pos = xyz(o.get("x").getAsString(), o.has("y") ? o.get("y").getAsString() : "~", o.get("z").getAsString());
				if (pos == null) continue;
				if (o.has("dimensions") && o.get("dimensions").isJsonArray()) {
					for (JsonElement d : o.getAsJsonArray("dimensions")) {
						String s = d.getAsString();
						String dim = s.endsWith("the_nether") ? "nether" : s.endsWith("the_end") ? "end" : s.endsWith("overworld") ? "ow" : null;
						if (dim != null) out.add(new Wp(name, dim, pos));
					}
				} else out.add(new Wp(name, "ow", pos));
			} catch (IOException | RuntimeException ignored) { }
		}
		return out;
	}

	private static String key(Wp w) { return w.name().toLowerCase() + "|" + w.dim() + "|" + w.xyz(); }
	private static String sv(JsonObject o, String k) { return o.has(k) && o.get(k).isJsonPrimitive() ? o.get(k).getAsString() : ""; }

	/**
	 * Mirrors the minimap into the places list. {@code seen} holds what the last sync saw, so a waypoint you delete or move on the
	 * minimap is removed here too, while places you made yourself are never touched. Updates {@code seen}; returns whether anything changed.
	 */
	static boolean apply(com.google.gson.JsonArray a, List<Wp> wps, List<String> seen) {
		boolean changed = false;
		Set<String> now = new HashSet<>();
		for (Wp w : wps) now.add(key(w));
		for (String k : new ArrayList<>(seen)) {            // gone from the minimap: blank that dimension
			if (now.contains(k)) continue;
			String[] p = k.split("\\|", 3);
			for (JsonElement e : a) {
				if (!e.isJsonObject()) continue;
				JsonObject o = e.getAsJsonObject();
				if (sv(o, "name").toLowerCase().equals(p[0]) && sv(o, p[1]).replaceAll("\\s+", " ").equals(p[2])) { o.addProperty(p[1], ""); changed = true; break; }
			}
		}
		for (Wp w : wps) {                                   // new or moved
			JsonObject match = null;
			for (JsonElement e : a) {
				if (!e.isJsonObject()) continue;
				JsonObject o = e.getAsJsonObject();
				if (sv(o, "name").equalsIgnoreCase(w.name()) && (sv(o, w.dim()).isBlank() || sv(o, w.dim()).equals(w.xyz()))) { match = o; break; }
			}
			if (match == null) {
				JsonObject row = new JsonObject();
				row.addProperty("id", Names.newId()); row.addProperty("name", w.name()); row.addProperty("cat", "Other");
				for (String k : new String[] {"ow", "nether", "end"}) row.addProperty(k, k.equals(w.dim()) ? w.xyz() : "");
				row.addProperty("portal", "No Portal"); row.addProperty("mm", true);
				a.add(row); changed = true;
			} else if (!sv(match, w.dim()).equals(w.xyz())) { match.addProperty(w.dim(), w.xyz()); changed = true; }
		}
		for (int i = a.size() - 1; i >= 0; i--) {            // a synced place with no coordinates left is removed
			JsonObject o = a.get(i).getAsJsonObject();
			if (o.has("mm") && sv(o, "ow").isBlank() && sv(o, "nether").isBlank() && sv(o, "end").isBlank()) { a.remove(i); changed = true; }
		}
		seen.clear(); seen.addAll(now);
		return changed;
	}
}
