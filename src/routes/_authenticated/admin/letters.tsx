import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Download } from "lucide-react";

async function downloadPdf(letter: Letter) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margin = 56;
  let y = height - margin;
  page.drawText("GRUPMAR TIME", { x: margin, y, size: 14, font: bold, color: rgb(0.1, 0.2, 0.5) });
  y -= 18;
  page.drawText("Comunicación interna disciplinaria", { x: margin, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
  y -= 24;
  page.drawText(`Tipo: ${letter.letter_type.toUpperCase()}  ·  Periodo: ${letter.month}/${letter.year}  ·  Umbral: ${letter.threshold ?? "-"}`, { x: margin, y, size: 10, font });
  y -= 14;
  page.drawText(`Trabajador: ${letter.employee?.full_name ?? "—"}`, { x: margin, y, size: 11, font: bold });
  y -= 22;
  const maxWidth = width - margin * 2;
  const lines: string[] = [];
  letter.content.split(/\n/).forEach(par => {
    const words = par.split(/\s+/);
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (font.widthOfTextAtSize(test, 11) > maxWidth) { lines.push(cur); cur = w; } else cur = test;
    }
    lines.push(cur);
    lines.push("");
  });
  for (const ln of lines) {
    if (y < margin + 40) { y = height - margin; pdf.addPage([595.28, 841.89]); }
    page.drawText(ln, { x: margin, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
    y -= 15;
  }
  y -= 30;
  page.drawText(`Generada: ${new Date(letter.generated_at).toLocaleString("es-ES")}  ·  Estado: ${letter.status}`, { x: margin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  const bytes = await pdf.save();
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `carta-${letter.employee?.full_name?.replace(/\s+/g, "_") ?? "trabajador"}-${letter.month}-${letter.year}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export const Route = createFileRoute("/_authenticated/admin/letters")({
  head: () => ({ meta: [{ title: "Cartas — GrupMar Time" }] }),
  component: LettersPage,
});

type Letter = {
  id: string; letter_type: string; month: number; year: number; threshold: number | null;
  tardiness_count: number; content: string; status: string; generated_at: string;
  employee?: { full_name: string } | null;
};

function LettersPage() {
  const [letters, setLetters] = useState<Letter[]>([]);
  const [open, setOpen] = useState<Letter | null>(null);
  const [content, setContent] = useState("");
  async function load() {
    const { data } = await supabase.from("disciplinary_letters")
      .select("*, employee:profiles!disciplinary_letters_employee_id_fkey(full_name)").order("generated_at", { ascending: false });
    setLetters((data ?? []) as Letter[]);
  }
  useEffect(() => { load(); }, []);
  async function save() {
    if (!open) return;
    await supabase.from("disciplinary_letters").update({ content }).eq("id", open.id);
    toast.success("Carta actualizada");
    setOpen(null);
    load();
  }
  async function approve(id: string) {
    await supabase.from("disciplinary_letters").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", id);
    toast.success("Carta aprobada"); load();
  }
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-1">Cartas disciplinarias</h1>
      <p className="text-sm text-muted-foreground mb-6">Generadas automáticamente como borrador. Revise antes de aprobar.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {letters.length === 0 && <p className="text-muted-foreground text-sm">Sin cartas.</p>}
        {letters.map(l => (
          <Card key={l.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">{l.employee?.full_name ?? "—"}</div>
              <Badge variant={l.status === "draft" ? "default" : "secondary"}>{l.status}</Badge>
            </div>
            <div className="text-xs text-muted-foreground mb-2">
              {l.letter_type} · {l.month}/{l.year} · umbral {l.threshold} · {l.tardiness_count} tardanzas
            </div>
            <p className="text-sm line-clamp-3 mb-3 whitespace-pre-line">{l.content}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setOpen(l); setContent(l.content); }}>Editar</Button>
              <Button size="sm" variant="outline" onClick={() => downloadPdf(l)}><Download className="w-3 h-3 mr-1" />PDF</Button>
              {l.status === "draft" && <Button size="sm" onClick={() => approve(l.id)}>Aprobar</Button>}
            </div>
          </Card>
        ))}
      </div>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar carta</DialogTitle></DialogHeader>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={18} className="font-mono text-xs" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(null)}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
