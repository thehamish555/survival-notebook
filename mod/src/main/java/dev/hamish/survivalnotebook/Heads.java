package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.client.gui.GuiGraphicsExtractor;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Player faces for the Members list. Looks the skin up from Mojang by UUID, then by username, and draws the 8x8 face (with the hat layer)
 * pixel by pixel. If nothing can be fetched it shows the plain player-head item, which is Steve.
 */
final class Heads {
	private Heads() { }

	private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(6)).build();
	private static final Map<String, int[]> FACES = new ConcurrentHashMap<>();   // 64 ARGB pixels
	private static final Map<String, Boolean> BUSY = new ConcurrentHashMap<>();

	/** Draws the face of the player; returns false while loading or if it couldn't be found (draw a fallback). */
	static boolean draw(GuiGraphicsExtractor g, String uuid, String name, int x, int y, int size) {
		String key = (uuid == null ? "" : uuid) + "|" + (name == null ? "" : name);
		if (key.equals("|")) return false;
		int[] f = FACES.get(key);
		if (f == null) { fetch(key, uuid, name); return false; }
		if (f.length == 0) return false;
		int s = Math.max(1, size / 8);
		for (int i = 0; i < 64; i++) if (f[i] != 0) g.fill(x + (i % 8) * s, y + (i / 8) * s, x + (i % 8 + 1) * s, y + (i / 8 + 1) * s, f[i]);
		return true;
	}

	private static void fetch(String key, String uuid, String name) {
		if (BUSY.putIfAbsent(key, true) != null) return;
		Api.EXEC.execute(() -> {
			int[] face = new int[0];
			try {
				String id = uuid == null ? "" : uuid.replace("-", "");
				if (id.length() != 32 && name != null && !name.isBlank()) id = idForName(name);   // no UUID: use the username
				if (id != null && id.length() == 32) face = face(skinPng(id));
			} catch (Exception ignored) { }
			FACES.put(key, face);
			Notebook.bump();   // redraw with the face
		});
	}

	private static String get(String url) throws Exception {
		HttpResponse<String> r = HTTP.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(8)).header("user-agent", "SurvivalNotebook-mod").build(), HttpResponse.BodyHandlers.ofString());
		if (r.statusCode() != 200) throw new Exception("HTTP " + r.statusCode());
		return r.body();
	}

	static String idForName(String name) throws Exception {
		return JsonParser.parseString(get("https://api.mojang.com/users/profiles/minecraft/" + name)).getAsJsonObject().get("id").getAsString();
	}

	private static byte[] skinPng(String id) throws Exception {
		JsonObject prof = JsonParser.parseString(get("https://sessionserver.mojang.com/session/minecraft/profile/" + id)).getAsJsonObject();
		String tex = prof.getAsJsonArray("properties").get(0).getAsJsonObject().get("value").getAsString();
		String url = skinUrl(new String(Base64.getDecoder().decode(tex)));
		HttpResponse<byte[]> r = HTTP.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(8)).build(), HttpResponse.BodyHandlers.ofByteArray());
		if (r.statusCode() != 200) throw new Exception("HTTP " + r.statusCode());
		return r.body();
	}

	/** The skin URL inside Mojang's base64 "textures" value. */
	static String skinUrl(String json) {
		return JsonParser.parseString(json).getAsJsonObject().getAsJsonObject("textures").getAsJsonObject("SKIN").get("url").getAsString();
	}

	/** The 8x8 face of a skin png, with the hat layer on top. */
	static int[] face(byte[] png) throws Exception {
		BufferedImage img = ImageIO.read(new ByteArrayInputStream(png));
		int[] out = new int[64];
		for (int y = 0; y < 8; y++) for (int x = 0; x < 8; x++) {
			int base = img.getRGB(8 + x, 8 + y), hat = img.getHeight() >= 16 ? img.getRGB(40 + x, 8 + y) : 0;
			out[y * 8 + x] = ((hat >>> 24) > 8 ? hat : base) | 0xFF000000;
		}
		return out;
	}
}
