package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.Level;

import java.lang.reflect.Method;
import java.util.List;

/**
 * Talks to JourneyMap while the game runs, by reflection through its own API (no dependency): turns its waypoints in the world on or
 * off, and shows the notebook's places on its minimap and full map. They're added as waypoints JourneyMap doesn't save, with the
 * place's item icon where the game has one, so they never end up in your own JourneyMap waypoints.
 */
final class JourneyMap {
	private JourneyMap() { }

	static boolean present() { return FabricLoader.getInstance().isModLoaded("journeymap"); }

	private static Class<?> cls(String n) throws ClassNotFoundException { return Class.forName(n, false, JourneyMap.class.getClassLoader()); }
	private static Object call(Object o, String name, Object... args) throws ReflectiveOperationException {
		for (Method m : o.getClass().getMethods()) {
			if (!m.getName().equals(name) || m.getParameterCount() != args.length) continue;
			Class<?>[] t = m.getParameterTypes();
			boolean fits = true;
			for (int i = 0; i < t.length && fits; i++) fits = args[i] == null ? !t[i].isPrimitive() : Xaero.box(t[i]).isInstance(args[i]);
			if (fits) { m.setAccessible(true); return m.invoke(o, args); }
		}
		throw new NoSuchMethodException(o.getClass().getName() + "." + name);
	}

	// ---- waypoints in the world (JourneyMap's "Show waypoints in world")

	private static Object field() throws ReflectiveOperationException {
		Object client = cls("journeymap.client.JourneymapClient").getMethod("getInstance").invoke(null);
		Object props = call(client, "getWaypointProperties");
		return new Object[] {props, props.getClass().getField("renderWaypointsWorld").get(props)};
	}

	private static Boolean seen; private static long seenAt;
	/** Whether JourneyMap draws its waypoints in the world, or null if that can't be read. Checked at most once a second. */
	static Boolean inWorld() {
		if (!present()) return null;
		long now = System.currentTimeMillis();
		if (now - seenAt < 1000) return seen;
		seenAt = now;
		try { Object v = call(((Object[]) field())[1], "get"); return seen = v instanceof Boolean b ? b : null; }
		catch (ReflectiveOperationException | RuntimeException | LinkageError e) { return seen = null; }
	}

	static boolean setInWorld(boolean on) {
		if (!present()) return false;
		try {
			Object[] pf = (Object[]) field();
			call(pf[1], "set", Boolean.valueOf(on));
			call(pf[0], "save");
			seen = on; seenAt = System.currentTimeMillis();
			return true;
		} catch (ReflectiveOperationException | RuntimeException | LinkageError e) { return false; }
	}

	// ---- the notebook's places on JourneyMap's maps

	private static String pushed = "";

	static void tick(List<JsonObject> rows, String sig) {
		if (!present()) return;
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null) { pushed = ""; return; }
		if (sig.equals(pushed)) return;
		pushed = sig;
		try {
			Object api = cls("journeymap.api.client.impl.ClientAPI").getField("INSTANCE").get(null);
			call(api, "removeAllWaypoints", SurvivalNotebookClient.ID);
			Method make = cls("journeymap.api.v2.common.waypoint.WaypointFactory").getMethod("createWaypoint", String.class, BlockPos.class, String.class, ResourceKey.class, boolean.class);
			for (JsonObject o : rows) {
				if (Notebook.bool(o, "mm")) continue;   // came from the minimap: it has it already
				String name = Notebook.str(o, "name").isBlank() ? "Place" : Notebook.str(o, "name");
				for (String d : new String[] {"ow", "nether", "end"}) {
					double[] p = Names.parse(Notebook.str(o, d));
					if (p == null) continue;
					ResourceKey<Level> key = d.equals("ow") ? Level.OVERWORLD : d.equals("nether") ? Level.NETHER : Level.END;
					Object wp = make.invoke(null, SurvivalNotebookClient.ID, BlockPos.containing(p[0], p[1], p[2]), name, key, false);   // false: JourneyMap doesn't save it
					call(wp, "setColor", Ui.cat(Notebook.str(o, "cat")).fg() & 0xFFFFFF);
					Identifier icon = iconOf(PagePlaces.icon(o));
					if (icon != null) { call(wp, "setIconIdentifier", icon); call(wp, "setIconTextureSize", 16, 16); }
					call(api, "addWaypoint", SurvivalNotebookClient.ID, wp);
				}
			}
		} catch (ReflectiveOperationException | RuntimeException | LinkageError ignored) { }
	}

	/** The item's own picture, if the game has one (block items like chests don't, so they keep JourneyMap's default icon). */
	private static Identifier iconOf(String item) {
		Identifier id = Identifier.tryParse("minecraft:textures/item/" + item + ".png");
		return id != null && Minecraft.getInstance().getResourceManager().getResource(id).isPresent() ? id : null;
	}
}
