package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;

import java.util.List;

/** Everyone in the notebook; your nickname; and (for the owner, with a "manage members" token) adding and removing people. */
final class PageMembers {
	private PageMembers() { }

	static String nick;       // null = reload from the server copy
	static String email = "", role = "editor", confirmRemove = "";

	static void build(NotebookScreen s, int startY) {
		Ui.Pal p = Ui.pal();
		boolean owner = Notebook.role.equals("owner");
		int y = startY;
		List<JsonObject> ms = Notebook.memberList();
		int reserve = owner ? 92 : 52;
		int vis = Math.max(1, (s.bottom - y - reserve) / 26), rowW = s.cw - 10;
		s.setScroll(ms.size(), vis);
		for (int i = 0; i < vis && NotebookScreen.scroll + i < ms.size(); i++) {
			JsonObject m = ms.get(NotebookScreen.scroll + i);
			final int ry = y + i * 26;
			final String id = Notebook.str(m, "id"), name = Notebook.str(m, "name") + (id.equals(Notebook.userId) ? " (you)" : ""), real = Notebook.str(m, "realName"), mrole = Notebook.str(m, "role");
			final boolean nicked = !Notebook.str(m, "nick").isBlank() && !real.isBlank(), removable = owner && !mrole.equals("owner"), armed = id.equals(confirmRemove);
			int right = removable ? 130 : 66;
			s.row(s.cx, ry, rowW, 25, rowW, i, null);
			s.paint((g, mx, my) -> {
				String[] mc = Notebook.mcOf(id);
				String uuid = mc == null ? Players.uuidOf(id) : mc[0], mcName = mc == null ? "" : mc[1];
				if (id.equals(Notebook.userId) && net.minecraft.client.Minecraft.getInstance().player != null) uuid = net.minecraft.client.Minecraft.getInstance().player.getUUID().toString();
				if (!Players.head(g, uuid, mcName, s.cx + 6, ry + 4, 16)) Compat.drawItem(g, "player_head", s.cx + 6, ry + 4);
				g.text(s.font(), name, s.cx + 30, ry + 9, p.ink, false);
				if (nicked) g.text(s.font(), Ui.clip(s.font(), "· " + real, rowW - right - 36 - s.font().width(name)), s.cx + 36 + s.font().width(name), ry + 9, p.mut, false);
				Ui.tag(g, s.font(), s.cx + rowW - 62, ry + 6, 56, 14, mrole, Ui.role(mrole), false);
			});
			if (removable) s.pill(s.cx + rowW - 128, ry + 5, 62, 15, armed ? "Sure?" : "Remove", p.danger, () -> {
				if (!armed) { confirmRemove = id; s.rebuild(); return; }
				confirmRemove = ""; Notebook.removeMember(id); s.rebuild();
			}, true);
		}
		int ny = s.bottom - 44;
		s.card(s.cx - 6, (owner ? ny - 48 : ny - 8), s.cw + 2, (owner ? 98 : 58));
		if (owner) {
			int ay = ny - 40;
			s.text("Invite someone by their account email.", s.cx, ay, p.mut);
			s.box(s.cx, ay + 12, s.cw - 190, "friend@example.com", email, v -> email = v);
			s.pill(s.cx + s.cw - 184, ay + 12, 76, 20, role.equals("editor") ? "Editor" : "Viewer", role.equals("editor") ? p.blue : p.gray, () -> { role = role.equals("editor") ? "viewer" : "editor"; s.rebuild(); }, true);
			s.btn(s.cx + s.cw - 102, ay + 12, 96, "Add member", 0, () -> {
				if (!email.contains("@")) { Notebook.error("Enter their account email"); return; }
				Notebook.addMember(email, role, () -> email = "");
			}, Notebook.ok);
		}
		s.text("Your nickname here (blank uses your account name)", s.cx, ny, p.mut);
		JsonObject me = Notebook.self();
		if (nick == null) nick = me == null ? "" : Notebook.str(me, "nick");
		s.box(s.cx, ny + 12, s.cw - 76, "Nickname", nick, v -> nick = v);
		s.btn(s.cx + s.cw - 70, ny + 12, 64, "Save", 0, () -> { Notebook.setNick(nick); nick = null; }, Notebook.ok);
	}
}
