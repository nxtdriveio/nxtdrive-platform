"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { useCallback, useState } from "react";
import type { ShortcodeDef } from "@/lib/notifications/shortcodes";
import { Button } from "@/components/ui/button";

export type TemplateEditorClientProps = {
  eventKey: string;
  channel: string;
  labelNl: string;
  initialSubject: string;
  initialBodyHtml: string;
  initialPushTitle: string;
  initialPushBody: string;
  initialInappTitle: string;
  initialInappBody: string;
  shortcodes: ShortcodeDef[];
  brandingHtml: string;
  cancelHref: string;
  action: (fd: FormData) => Promise<void>;
};

function interpolatePreview(html: string, shortcodes: ShortcodeDef[]): string {
  let result = html;
  for (const sc of shortcodes) {
    result = result.replace(
      new RegExp(`\\{\\{\\s*${sc.code}\\s*\\}\\}`, "gi"),
      `<span style="background:#dbeafe;color:#1e40af;border-radius:2px;padding:0 2px">${sc.example}</span>`,
    );
  }
  return result;
}

function insertShortcodeIntoInput(code: string) {
  const text = `{{${code}}}`;
  const active = document.activeElement as HTMLTextAreaElement | HTMLInputElement | null;
  if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")) {
    const start = active.selectionStart ?? active.value.length;
    const end = active.selectionEnd ?? start;
    const newVal = active.value.slice(0, start) + text + active.value.slice(end);
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(active),
      "value",
    )?.set;
    nativeInputValueSetter?.call(active, newVal);
    active.dispatchEvent(new Event("input", { bubbles: true }));
    const cursor = start + text.length;
    active.setSelectionRange(cursor, cursor);
    active.focus();
  }
}

export function TemplateEditorClient({
  eventKey,
  channel,
  initialSubject,
  initialBodyHtml,
  initialPushTitle,
  initialPushBody,
  initialInappTitle,
  initialInappBody,
  shortcodes,
  brandingHtml,
  cancelHref,
  action,
}: TemplateEditorClientProps) {
  const isEmail = channel === "email";
  const isPush = channel === "push";
  const isInApp = channel === "inapp";

  const [subject, setSubject] = useState(initialSubject);
  const [pushTitle, setPushTitle] = useState(initialPushTitle);
  const [pushBody, setPushBody] = useState(initialPushBody);
  const [inappTitle, setInappTitle] = useState(initialInappTitle);
  const [inappBody, setInappBody] = useState(initialInappBody);
  const [saving, setSaving] = useState(false);
  const [activePreview, setActivePreview] = useState(false);

  // useEditor must always be called (React hook rules). We pass a no-op config
  // when channel !== email and simply don't render the editor.
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Underline,
      TextStyle,
      Color,
    ],
    content: initialBodyHtml || "<p></p>",
    editorProps: {
      attributes: {
        class: "min-h-[200px] focus:outline-none text-foreground prose prose-sm max-w-none",
      },
    },
    immediatelyRender: false,
  });

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      const fd = new FormData();
      fd.set("event_key", eventKey);
      fd.set("channel", channel);
      if (isEmail) {
        fd.set("subject", subject);
        fd.set("body_html", editor?.getHTML() ?? "");
        fd.set("body_text", editor?.getText() ?? "");
      } else if (isPush) {
        fd.set("push_title", pushTitle);
        fd.set("push_body", pushBody);
      } else if (isInApp) {
        fd.set("inapp_title", inappTitle);
        fd.set("inapp_body", inappBody);
      }
      try {
        await action(fd);
      } finally {
        setSaving(false);
      }
    },
    [
      action,
      channel,
      editor,
      eventKey,
      inappBody,
      inappTitle,
      isEmail,
      isInApp,
      isPush,
      pushBody,
      pushTitle,
      subject,
    ],
  );

  const currentHtml = isEmail ? (editor?.getHTML() ?? "") : "";
  const previewHtml = brandingHtml.replace(
    "{{INNER}}",
    interpolatePreview(currentHtml, shortcodes),
  );

  return (
    <div className="space-y-6">
      {/* Shortcode picker */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Beschikbare variabelen
        </p>
        <div className="flex flex-wrap gap-1.5">
          {shortcodes.map((sc) => (
            <button
              key={sc.code}
              type="button"
              title={`${sc.label} (voorbeeld: ${sc.example})`}
              onClick={() => {
                if (isEmail && editor) {
                  editor.chain().focus().insertContent(`{{${sc.code}}}`).run();
                } else {
                  insertShortcodeIntoInput(sc.code);
                }
              }}
              className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary hover:bg-primary/20 transition-colors"
            >
              {"{{"}{sc.code}{"}}"}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {isEmail && (
          <>
            {/* Onderwerpregel */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Onderwerpregel</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Bijv. Je rijles is bevestigd — {{lesson_time}}"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {/* TipTap editor */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Berichtinhoud</label>
                <button
                  type="button"
                  onClick={() => setActivePreview((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  {activePreview ? "Editor" : "Preview"}
                </button>
              </div>

              {!activePreview ? (
                <div className="rounded-md border border-border bg-background overflow-hidden">
                  {editor && (
                    <BubbleMenu
                      editor={editor}
                    >
                      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-1 shadow-lg">
                        {[
                          {
                            label: "B",
                            cmd: () => editor.chain().focus().toggleBold().run(),
                            active: editor.isActive("bold"),
                            title: "Vet",
                          },
                          {
                            label: "I",
                            cmd: () => editor.chain().focus().toggleItalic().run(),
                            active: editor.isActive("italic"),
                            title: "Cursief",
                          },
                          {
                            label: "U",
                            cmd: () => editor.chain().focus().toggleUnderline().run(),
                            active: editor.isActive("underline"),
                            title: "Onderstreept",
                          },
                        ].map((btn) => (
                          <button
                            key={btn.title}
                            type="button"
                            title={btn.title}
                            onClick={btn.cmd}
                            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                              btn.active
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted text-foreground"
                            }`}
                          >
                            {btn.label}
                          </button>
                        ))}
                        <div className="h-4 w-px bg-border mx-0.5" />
                        <input
                          type="color"
                          title="Tekstkleur"
                          onChange={(e) =>
                            editor.chain().focus().setColor(e.target.value).run()
                          }
                          className="h-6 w-6 cursor-pointer rounded border-none bg-transparent p-0"
                        />
                        <button
                          type="button"
                          title="Link invoegen"
                          onClick={() => {
                            const url = window.prompt("URL");
                            if (url) {
                              editor
                                .chain()
                                .focus()
                                .setLink({ href: url, target: "_blank" })
                                .run();
                            }
                          }}
                          className="rounded px-2 py-1 text-xs font-medium hover:bg-muted text-foreground"
                        >
                          Link
                        </button>
                      </div>
                    </BubbleMenu>
                  )}
                  <EditorContent
                    editor={editor}
                    className="px-4 py-3 [&_.ProseMirror]:min-h-[180px] [&_.ProseMirror]:focus:outline-none"
                  />
                </div>
              ) : (
                <div className="rounded-md border border-border bg-background overflow-auto max-h-[500px]">
                  <div
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                    className="scale-[0.85] origin-top"
                  />
                </div>
              )}
            </div>
          </>
        )}

        {isPush && (
          <>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Titel</label>
              <input
                type="text"
                value={pushTitle}
                onChange={(e) => setPushTitle(e.target.value)}
                placeholder="Bijv. Lesherinnering"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Berichttekst</label>
              <textarea
                value={pushBody}
                onChange={(e) => setPushBody(e.target.value)}
                rows={3}
                placeholder="Bijv. Je les staat gepland op {{lesson_time}}."
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>
          </>
        )}

        {isInApp && (
          <>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Titel</label>
              <input
                type="text"
                value={inappTitle}
                onChange={(e) => setInappTitle(e.target.value)}
                placeholder="Bijv. Lesherinnering"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Berichttekst</label>
              <textarea
                value={inappBody}
                onChange={(e) => setInappBody(e.target.value)}
                rows={3}
                placeholder="Bijv. Je les staat gepland op {{lesson_time}}."
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>
          </>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Opslaan..." : "Opslaan"}
          </Button>
          <a
            href={cancelHref}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Annuleren
          </a>
        </div>
      </form>
    </div>
  );
}
