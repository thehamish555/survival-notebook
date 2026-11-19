package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

/** To-dos: quick add, filters, inline progress, and a full editor (project, priority, progress, assignee, notes, delete). */
final class PageTodo {
	private PageTodo() { }

	static final String[] PRIO = {"Low", "Medium", "High"}, PROG = {"To-Do", "In Progress", "Done"};
	static JsonObject draft;
	static boolean isNew, confirmDel, mineOnly, showDone;
	static String query = "";
	

	static void reset() { pickingIcon = false; draft = null; confirmDel = false; }

	static void open(String id) {
		JsonObject o = Notebook.find("todos", id);
		if (o == null) return;
		draft = o.deepCopy(); isNew = false; confirmDel = false; NotebookScreen.scroll = 0;
	}

	/** "" (unassigned) followed by every member id. */
	static String[] assignees() {
		List<String> ids = new ArrayList<>(List.of(""));
		for (JsonObject m : Notebook.memberList()) ids.add(Notebook.str(m, "id"));
		return ids.toArray(new String[0]);
	}

	static String assigneeLabel(String id) {
		String n = id.isBlank() ? "" : Notebook.memberName(id);
		return n.isBlank() ? "All users" : n;   // nobody assigned = it's for everyone
	}

	static List<String> assigneeLabels() { List<String> l = new ArrayList<>(); for (String id : assignees()) l.add(assigneeLabel(id)); return l; }
	static String assigneeId(String label) { for (String id : assignees()) if (assigneeLabel(id).equals(label)) return id; return ""; }

	static boolean pickingIcon;

	static void build(NotebookScreen s) { if (draft != null) { if (pickingIcon) iconPicker(s); else editor(s); } else list(s); }

	private static void iconPicker(NotebookScreen s) { IconPicker.build(s, draft, () -> { pickingIcon = false; s.rebuild(); }); }

	private static void list(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		int y = s.top;
		s.btn(s.cx, y, 90, "+ Add to-do", 0, () -> {
			JsonObject d = new JsonObject();
			d.addProperty("id", Names.newId()); d.addProperty("project", ""); d.addProperty("priority", "Medium");
			d.addProperty("progress", "To-Do"); d.addProperty("assignee", Notebook.userId); d.addProperty("notes", "");
			draft = d; isNew = true; confirmDel = false; NotebookScreen.scroll = 0; s.rebuild();
		}, Notebook.canEdit());
		s.dropdown("todo-who", s.cx + 96, y, 116, "Show", List.of("Mine", "Everyone"), mineOnly ? "Mine" : "Everyone", p.gray, v -> { mineOnly = v.equals("Mine"); NotebookScreen.scroll = 0; });
		s.dropdown("todo-done", s.cx + 218, y, 126, "Done", List.of("Hidden", "Shown"), showDone ? "Shown" : "Hidden", p.gray, v -> { showDone = v.equals("Shown"); NotebookScreen.scroll = 0; });
		boolean autoOn = Notebook.autoFarmsOn(), narrow = 478 > s.cw - 8;   // too narrow for all four: Farm to-do goes on the next row, with the search
		s.pill(narrow ? s.cx : s.cx + 350, narrow ? y + 26 : y, 128, 20, "Farm to-do: " + (autoOn ? "on" : "off"), autoOn ? p.green : p.gray, Notebook::toggleAutoFarms, Notebook.canEdit());

		List<JsonObject> all = new ArrayList<>();
		for (JsonObject o : Notebook.todoList(mineOnly, showDone)) if (NotebookScreen.has(query, Notebook.str(o, "project"), Notebook.str(o, "notes"), Notebook.memberName(Notebook.str(o, "assignee")))) all.add(o);
		int listTop = narrow ? s.searchRow("todo-q", y + 26, 128, 120, "", s.cx + 134, query, v -> { query = v; NotebookScreen.scroll = 0; })
			: s.searchRow("todo-q", y, 478, 120, "", s.cx + 134, query, v -> { query = v; NotebookScreen.scroll = 0; });
		final JsonObject farm = Notebook.farmSection(showDone);
		if (farm != null) {   // automatic section: worked out from the farms page, can't be edited here
			final String fp = Notebook.str(farm, "project"), fprog = Notebook.str(farm, "progress");
			final int fy = listTop, fw = s.cw - 10;
			s.paint((g, mx, my) -> {
				g.fill(s.cx, fy, s.cx + fw, fy + 22, p.panel2);
				g.fill(s.cx, fy, s.cx + 2, fy + 22, p.green.fg());
				Compat.drawItem(g, "hopper", s.cx + 6, fy + 3);
				g.text(s.font(), fp, s.cx + 28, fy + 7, p.ink, false);
				String tag = "Automatic · from Farms";
				g.text(s.font(), tag, s.cx + fw - 100 - s.font().width(tag), fy + 7, p.mut, false);
			});
			s.pill(s.cx + fw - 96, fy + 3, 94, 17, fprog, Ui.progress(fprog), () -> { }, false);
			listTop += 28;
		}
		int vis = Math.max(1, (s.bottom - listTop) / 22);
		s.setScroll(all.size(), vis);
		if (all.isEmpty()) s.text(mineOnly ? "Nothing assigned to you." : "Nothing to do. Add something above.", s.cx + 4, listTop + 6, p.mut);
		int rowW = s.cw - 10;
		for (int i = 0; i < vis && NotebookScreen.scroll + i < all.size(); i++) {
			JsonObject o = all.get(NotebookScreen.scroll + i);
			final int ry = listTop + i * 22;
			final String id = Notebook.str(o, "id"), project = Notebook.str(o, "project"), prog = Notebook.str(o, "progress"), pr = Notebook.str(o, "priority");
			final String who = Notebook.memberName(Notebook.str(o, "assignee"));
			final boolean done = prog.equals("Done");
			final String icon = Notebook.str(o, "icon");
			{ int at = NotebookScreen.scroll + i; s.reorder("todos", id, at > 0 ? Notebook.str(all.get(at - 1), "id") : "", at + 1 < all.size() ? Notebook.str(all.get(at + 1), "id") : "", ry, 21); }
			s.row(s.cx, ry, rowW, 21, rowW - 100, i, () -> { open(id); s.rebuild(); });
			s.paint((g, mx, my) -> {
				g.fill(s.cx + 4, ry + 4, s.cx + 7, ry + 17, Ui.priority(pr).fg());
				int whoW = who.isEmpty() ? 0 : s.font().width(who) + 10;
				Compat.drawItem(g, icon, s.cx + 10, ry + 3);
				g.text(s.font(), Ui.clip(s.font(), project.isBlank() ? "Untitled to-do" : project, rowW - 136 - whoW), s.cx + 30, ry + 7, done ? p.mut : p.ink, false);
				if (!who.isEmpty()) g.text(s.font(), who, s.cx + rowW - 102 - s.font().width(who), ry + 7, p.mut, false);
			});
			if (Notebook.canEdit()) s.dropdown("todo-row-" + id, s.cx + rowW - 96, ry + 2, 94, 17, "", List.of(PROG), prog, Ui.progress(prog), v -> Notebook.patchRow("todos", id, t -> t.addProperty("progress", v)));
			else s.pill(s.cx + rowW - 82, ry + 2, 80, 17, prog, Ui.progress(prog), () -> { }, false);
		}
	}

	private static void editor(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		final String id = Notebook.str(draft, "id");
		int lw = 66, bx = s.cx + lw, bw = s.cw - lw - 6, y = s.top;
		s.card(s.cx - 6, y + 10, s.cw + 2, 164);
		s.text(isNew ? "New to-do" : "Edit to-do", s.cx, y - 1, p.gold);
		y += 14;
		s.text("Name", s.cx, y + 6, p.mut);
		s.box(bx, y, bw, "What needs doing?", Notebook.str(draft, "project"), v -> draft.addProperty("project", v));
		y += 26;
		final String ic = Notebook.str(draft, "icon");
		s.text("Icon", s.cx, y + 6, p.mut);
		final int iy = y;
		s.paint((g, mx, my) -> { g.fill(bx, iy, bx + 22, iy + 22, p.row); Compat.drawItem(g, ic, bx + 3, iy + 3); });
		s.btn(bx + 28, y, 100, ic.isBlank() ? "Choose icon…" : "Change icon…", 1, () -> { pickingIcon = true; IconPicker.reset(); NotebookScreen.scroll = 0; s.rebuild(); }, Notebook.canEdit());
		y += 26;
		final String pr = Notebook.str(draft, "priority").isBlank() ? "Medium" : Notebook.str(draft, "priority"), prog = Notebook.str(draft, "progress").isBlank() ? "To-Do" : Notebook.str(draft, "progress");
		s.text("Status", s.cx, y + 6, p.mut);
		s.dropdown("todo-prio", bx, y, 130, "Priority", List.of(PRIO), pr, Ui.priority(pr), v -> draft.addProperty("priority", v));
		s.dropdown("todo-prog", bx + 136, y, 150, "Progress", List.of(PROG), prog, Ui.progress(prog), v -> draft.addProperty("progress", v));
		y += 26;
		final String cur = Notebook.str(draft, "assignee");
		s.text("Assigned", s.cx, y + 6, p.mut);
		s.dropdown("todo-who-edit", bx, y, 220, "For", assigneeLabels(), assigneeLabel(cur), cur.isBlank() ? p.gray : p.blue, v -> draft.addProperty("assignee", assigneeId(v)));
		y += 26;
		s.text("Notes", s.cx, y + 6, p.mut);
		s.box(bx, y, bw, "Optional notes", Notebook.str(draft, "notes"), v -> draft.addProperty("notes", v));

		int by = s.bottom - 20;
		s.btn(s.cx, by, 64, "Save", 0, () -> {
			if (Notebook.str(draft, "project").isBlank()) { Notebook.error("Give the to-do a name first"); return; }
			if (isNew && Notebook.str(draft, "project").isBlank() && Notebook.str(draft, "notes").isBlank()) { draft = null; s.rebuild(); return; }   // nothing typed: don't create an empty to-do
			Notebook.saveRow("todos", draft);
			draft = null; s.rebuild();
		}, Notebook.canEdit());
		if (!isNew) s.btn(s.cx + 70, by, 96, confirmDel ? "Really delete?" : "Delete", 2, () -> {
			if (!confirmDel) { confirmDel = true; s.rebuild(); return; }
			Notebook.deleteRow("todos", id);
			draft = null; confirmDel = false; s.rebuild();
		}, Notebook.canEdit());
		s.btn(s.cx + s.cw - 70, by, 64, "Back", 1, () -> { draft = null; confirmDel = false; s.rebuild(); }, true);
	}
}
