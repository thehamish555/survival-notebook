package dev.hamish.survivalnotebook;

import com.google.gson.*;

import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.UnaryOperator;

/** Talks to the Survival Notebook API. Everything here blocks, so call it from {@link #EXEC}, never the render thread. */
final class Api {
	static final class ApiException extends Exception {
		final int status;
		ApiException(int status, String message) { super(message); this.status = status; }
	}

	record Res(int status, JsonElement body) {
		JsonObject obj() { return body.getAsJsonObject(); }
	}

	/** One worker thread: operations run in order, so the mod never races itself. */
	static final ExecutorService EXEC = Executors.newSingleThreadExecutor(r -> {
		Thread t = new Thread(r, "survival-notebook-sync");
		t.setDaemon(true);
		return t;
	});

	private static final String UA = "survival-notebook-mod/" + FabricLoader.getInstance().getModContainer("survival_notebook")
		.map(m -> m.getMetadata().getVersion().getFriendlyString()).orElse("dev");

	private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
	private static final Gson GSON = new Gson();

	static Res call(String method, String path, JsonElement body) throws ApiException {
		NbConfig c = NbConfig.get();
		if (!c.connected()) throw new ApiException(0, "Paste your token in Settings (website: Account & mod)");
		try {
			HttpRequest req = HttpRequest.newBuilder(URI.create(c.base() + path)).timeout(Duration.ofSeconds(15))
				.header("authorization", "Bearer " + c.token).header("user-agent", UA).header("content-type", "application/json")
				.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(GSON.toJson(body)))
				.build();
			HttpResponse<String> r = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
			JsonElement json;
			try { json = r.body().isBlank() ? JsonNull.INSTANCE : JsonParser.parseString(r.body()); }
			catch (JsonParseException e) { throw new ApiException(r.statusCode(), "Unexpected reply from the API (HTTP " + r.statusCode() + ")"); }
			return new Res(r.statusCode(), json);
		} catch (IllegalArgumentException e) {
			throw new ApiException(0, "Can't reach the server");
		} catch (IOException e) {
			NbConfig.forgetBase(); throw new ApiException(0, "Can't reach the server");
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new ApiException(0, "Interrupted");
		}
	}

	static Res ok(Res r) throws ApiException {
		if (r.status() >= 200 && r.status() < 300) return r;
		if (r.status() == 401) throw new ApiException(401, "Token rejected. Create a new one on the website.");
		String msg = r.body().isJsonObject() && r.body().getAsJsonObject().has("error") ? r.body().getAsJsonObject().get("error").getAsString() : "HTTP " + r.status();
		throw new ApiException(r.status(), msg);
	}

	/** Opens the notebook's live event stream (server-sent events). The caller reads lines and closes it. */
	static java.io.InputStream stream(String path) throws ApiException {
		NbConfig c = NbConfig.get();
		if (!c.connected()) throw new ApiException(0, "No token");
		try {
			HttpRequest req = HttpRequest.newBuilder(URI.create(c.base() + path)).header("authorization", "Bearer " + c.token).header("user-agent", UA)
				.header("accept", "text/event-stream").GET().build();
			HttpResponse<java.io.InputStream> r = HTTP.send(req, HttpResponse.BodyHandlers.ofInputStream());
			if (r.statusCode() != 200) { r.body().close(); throw new ApiException(r.statusCode(), r.statusCode() == 401 ? "Token rejected. Create a new one on the website." : "HTTP " + r.statusCode()); }
			return r.body();
		} catch (IllegalArgumentException e) {
			throw new ApiException(0, "Can't reach the server");
		} catch (IOException e) {
			NbConfig.forgetBase(); throw new ApiException(0, "Can't reach the server");
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new ApiException(0, "Interrupted");
		}
	}

	/** Title of a YouTube video (public oEmbed lookup), or "" if unavailable. */
	static String youtubeTitle(String url) {
		try {
			HttpRequest req = HttpRequest.newBuilder(URI.create("https://www.youtube.com/oembed?format=json&url=" + java.net.URLEncoder.encode(url, java.nio.charset.StandardCharsets.UTF_8)))
				.timeout(Duration.ofSeconds(8)).header("user-agent", UA).GET().build();
			HttpResponse<String> r = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
			if (r.statusCode() / 100 == 2) { JsonObject o = JsonParser.parseString(r.body()).getAsJsonObject(); return o.has("title") ? o.get("title").getAsString() : ""; }
		} catch (Exception ignored) { }
		return "";
	}

	/** Uploads raw bytes (a .litematic file). Returns the website's file record {id, name, size}. */
	static JsonObject upload(String nb, String name, byte[] data) throws ApiException {
		NbConfig c = NbConfig.get();
		if (!c.connected()) throw new ApiException(0, "No token");
		try {
			HttpRequest req = HttpRequest.newBuilder(URI.create(c.base() + "/notebooks/" + nb + "/files?name=" + java.net.URLEncoder.encode(name, java.nio.charset.StandardCharsets.UTF_8)))
				.timeout(Duration.ofSeconds(30)).header("authorization", "Bearer " + c.token).header("user-agent", UA).header("content-type", "application/octet-stream")
				.POST(HttpRequest.BodyPublishers.ofByteArray(data)).build();
			HttpResponse<String> r = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
			return ok(new Res(r.statusCode(), r.body().isBlank() ? JsonNull.INSTANCE : JsonParser.parseString(r.body()))).obj();
		} catch (IllegalArgumentException | IOException e) {
			NbConfig.forgetBase(); throw new ApiException(0, "Can't reach the server");
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new ApiException(0, "Interrupted");
		}
	}

	/** Deletes an uploaded file (used when a farm draft is cancelled after its file was already uploaded). */
	static void deleteFile(String nb, String fileId) throws ApiException { ok(call("DELETE", "/notebooks/" + nb + "/files/" + fileId, null)); }

	static byte[] download(String nb, String fileId) throws ApiException {
		NbConfig c = NbConfig.get();
		if (!c.connected()) throw new ApiException(0, "No token");
		try {
			HttpRequest req = HttpRequest.newBuilder(URI.create(c.base() + "/notebooks/" + nb + "/files/" + fileId)).timeout(Duration.ofSeconds(30))
				.header("authorization", "Bearer " + c.token).header("user-agent", UA).GET().build();
			HttpResponse<byte[]> r = HTTP.send(req, HttpResponse.BodyHandlers.ofByteArray());
			if (r.statusCode() / 100 != 2) throw new ApiException(r.statusCode(), r.statusCode() == 404 ? "That file no longer exists" : "Download failed (HTTP " + r.statusCode() + ")");
			return r.body();
		} catch (IllegalArgumentException | IOException e) {
			NbConfig.forgetBase(); throw new ApiException(0, "Can't reach the server");
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new ApiException(0, "Interrupted");
		}
	}

	static JsonObject me() throws ApiException { return ok(call("GET", "/me", null)).obj(); }
	static JsonArray notebooks() throws ApiException { return ok(call("GET", "/notebooks", null)).body().getAsJsonArray(); }
	static String createNotebook(String title) throws ApiException {
		JsonObject b = new JsonObject(); b.addProperty("title", title);
		return ok(call("POST", "/notebooks", b)).obj().get("id").getAsString();
	}
	static JsonObject notebook(String id) throws ApiException { return ok(call("GET", "/notebooks/" + id, null)).obj(); }

	/**
	 * Read-modify-write one section with optimistic concurrency: if the website changed it in between (HTTP 409)
	 * we re-read and apply the change again. {@code fn} returns the new list, or null/unchanged to skip the write.
	 * @return true if something was written
	 */
	static boolean mutate(String nb, String section, UnaryOperator<JsonArray> fn) throws ApiException {
		for (int attempt = 0; attempt < 4; attempt++) {
			JsonObject cur = ok(call("GET", "/notebooks/" + nb + "/s/" + section, null)).obj();
			JsonArray old = cur.get("data").isJsonArray() ? cur.getAsJsonArray("data") : new JsonArray();
			JsonArray next = fn.apply(old.deepCopy());
			if (next == null || next.equals(old)) return false;
			JsonObject body = new JsonObject();
			body.add("data", next);
			body.addProperty("baseRev", cur.get("rev").getAsInt());
			Res r = call("PUT", "/notebooks/" + nb + "/s/" + section, body);
			if (r.status() == 409) continue;
			ok(r);
			return true;
		}
		throw new ApiException(409, "The website kept changing this list. Try again.");
	}
}
