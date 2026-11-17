package dev.hamish.survivalnotebook;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** Settings stored in config/survival-notebook.json. The token lives here, so don't share this file. */
final class NbConfig {
	String apiUrl = "", token = "", notebookId = "", notebookTitle = "";
	String trackedPlace = "", webUrl = "", mmDir = "", mmApp = "";
	java.util.List<String> mmSeen = new java.util.ArrayList<>();
	boolean autoSyncGear = true, autoSaveDeaths = true, autoTrackDeath = true, autoRecover = true, compass = true, hudGoals = true, shareStats = true, hud = true, hudMineOnly = true, lightTheme = false, sounds = true, worldNotebooks = true, shareInventory = true, shareMap = true, sharePosition = true;
	java.util.Map<String, String> worlds = new java.util.HashMap<>();

	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static NbConfig inst;

	private static Path file() { return FabricLoader.getInstance().getConfigDir().resolve("survival-notebook.json"); }

	static synchronized NbConfig get() {
		if (inst == null) {
			try { if (Files.exists(file())) inst = GSON.fromJson(Files.readString(file()), NbConfig.class); } catch (Exception ignored) { }
			if (inst == null) inst = new NbConfig();
			// Early versions saved localhost here as a default. It was ignored until 1.2.1 started honouring apiUrl, which cut those players off.
			if (inst.apiUrl != null && inst.apiUrl.trim().replaceAll("/+$", "").equalsIgnoreCase(LOCAL_API)) { inst.apiUrl = ""; save(); }
		}
		return inst;
	}

	static synchronized void save() {
		try { Files.writeString(file(), GSON.toJson(get())); } catch (IOException ignored) { }
	}

	/** The hosted API, served over HTTPS through a Cloudflare Tunnel. */
	static final String OFFICIAL_API = "https://notebook-api.hamish555.com";
	static final String LOCAL_API = "http://localhost:8787";
	private static volatile String resolved;

	boolean connected() { return token.startsWith("snp_"); }

	/** Your own server if you set apiUrl in the config file; otherwise the official one, quietly falling back to localhost if that can't be reached. */
	String base() {
		if (apiUrl != null && !apiUrl.isBlank()) return apiUrl.trim().replaceAll("/+$", "");
		String r = resolved;
		if (r != null) return r;
		r = reachable(OFFICIAL_API) ? OFFICIAL_API : reachable(LOCAL_API) ? LOCAL_API : OFFICIAL_API;
		resolved = r;
		return r;
	}
	/** Forget the cached choice after a connection failure so the next call tries again. */
	static void forgetBase() { resolved = null; }

	private static boolean reachable(String u) {
		try {
			var req = java.net.http.HttpRequest.newBuilder(java.net.URI.create(u + "/health")).timeout(java.time.Duration.ofSeconds(3)).GET().build();
			return java.net.http.HttpClient.newHttpClient().send(req, java.net.http.HttpResponse.BodyHandlers.discarding()).statusCode() < 500;
		} catch (Exception e) { return false; }
	}
	/** The website, for "open in browser" buttons. Blank = the official site. */
	String web() { return (webUrl == null || webUrl.isBlank() ? "https://notebook.hamish555.com" : webUrl.trim()).replaceAll("/+$", ""); }
	String tokenHint() { return token.length() > 8 ? "snp_••••" + token.substring(token.length() - 4) : ""; }
}
