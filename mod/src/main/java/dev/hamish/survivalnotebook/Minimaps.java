package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

/** The minimap mods the notebook works with while the game runs (Xaero's Minimap, JourneyMap), behind one set of calls. */
final class Minimaps {
	private Minimaps() { }

	/** The installed ones, by the name the settings show. */
	static List<String> installed() {
		List<String> out = new ArrayList<>();
		if (Xaero.present()) out.add("Xaero's");
		if (JourneyMap.present()) out.add("JourneyMap");
		return out;
	}

	private static Boolean inWorld(String name) { return name.equals("Xaero's") ? Xaero.inWorld() : JourneyMap.inWorld(); }

	/** Whether any installed minimap draws its waypoints in the world right now. */
	static boolean anyInWorld() { for (String n : installed()) if (!Boolean.FALSE.equals(inWorld(n))) return true; return false; }

	/** Whose waypoints show in the world: Ours, a minimap's name, or Off. */
	static String mode() {
		if (NbConfig.get().waypoints) return "Ours";
		for (String n : installed()) if (Boolean.TRUE.equals(inWorld(n))) return n;
		return "Off";
	}

	/** Shows one kind of waypoints in the world and turns the others off. The minimaps keep showing their waypoints on the map either way. */
	static void setMode(String v) {
		NbConfig.get().waypoints = v.equals("Ours");
		if (Xaero.present()) Xaero.setInWorld(v.equals("Xaero's"));
		if (JourneyMap.present()) JourneyMap.setInWorld(v.equals("JourneyMap"));
	}

	static List<String> modes() { List<String> m = new ArrayList<>(List.of("Ours")); m.addAll(installed()); m.add("Off"); return m; }

	/** Every few seconds: your places on each installed minimap's maps, redone only when they changed. */
	static void tick() {
		if (installed().isEmpty()) return;
		boolean on = NbConfig.get().minimapPlaces && Notebook.ok;
		List<JsonObject> rows = on ? Notebook.rows("coords") : List.of();
		StringBuilder sig = new StringBuilder(on ? "on" : "off");
		for (JsonObject o : rows) sig.append(Notebook.str(o, "id")).append(Notebook.str(o, "name")).append(Notebook.str(o, "cat")).append(Notebook.str(o, "icon")).append(Notebook.str(o, "ow")).append('|').append(Notebook.str(o, "nether")).append('|').append(Notebook.str(o, "end")).append(Notebook.bool(o, "mm")).append(';');
		Xaero.tick(rows, sig.toString());
		JourneyMap.tick(rows, sig.toString());
	}
}
