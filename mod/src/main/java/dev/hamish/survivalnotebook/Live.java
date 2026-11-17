package dev.hamish.survivalnotebook;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Listens to the notebook's live event stream so changes made on the website (or by friends) show up in game within a moment. */
final class Live {
	private Live() { }

	private static final AtomicBoolean pending = new AtomicBoolean();
	private static final ScheduledExecutorService SCHED = Executors.newSingleThreadScheduledExecutor(r -> {
		Thread t = new Thread(r, "survival-notebook-sched");
		t.setDaemon(true);
		return t;
	});
	private static volatile InputStream current;
	private static boolean started;

	static synchronized void start() {
		if (started) return;
		started = true;
		Thread t = new Thread(Live::loop, "survival-notebook-live");
		t.setDaemon(true);
		t.start();
	}

	/** Drops the connection so it reconnects with the latest settings (new token, notebook or URL). */
	static void restart() {
		InputStream in = current;
		if (in != null) try { in.close(); } catch (IOException ignored) { }
	}

	/** Coalesces bursts of events into one refresh. */
	static void refreshSoon() {
		if (pending.compareAndSet(false, true)) SCHED.schedule(() -> { pending.set(false); Notebook.refresh(); }, 350, TimeUnit.MILLISECONDS);
	}

	private static void loop() {
		int backoff = 2;
		while (true) {
			NbConfig c = NbConfig.get();
			if (!c.connected() || c.notebookId.isBlank()) { Notebook.setLive(false); sleep(3000); continue; }
			try (InputStream in = Api.stream("/notebooks/" + c.notebookId + "/events")) {
				current = in;
				backoff = 2;
				Notebook.setLive(true);
				Players.load(c.notebookId);   // who's on right now
				BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
				String line;
				while ((line = r.readLine()) != null) {
					if (!line.startsWith("data:") || line.substring(5).isBlank()) continue;   // pings carry no data
					if (Players.onEvent(line.substring(5))) continue;   // someone moved: the map reads it when it draws
					if (!line.contains("\"map\":true")) refreshSoon();   // new map tiles don't change anything shown in game
				}
			} catch (Api.ApiException | IOException ignored) { /* retry below */ }
			current = null;
			Notebook.setLive(false);
			sleep(backoff * 1000L);
			backoff = Math.min(30, backoff * 2);
		}
	}

	private static void sleep(long ms) {
		try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
	}
}
