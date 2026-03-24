import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { FileUp, Download, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useEffect } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRows?: FiscalRow[];
}

interface FiscalRow {
  filename: string;
  dataEntrada: string;
  especie: string;
  nNF: string;
  serie: string;
  dataDoc: string;
  cnpjEmit: string;
  uf: string;
  vNF: number;
  cfop: string;
  imposto: string;
  codigoA: string;
  bCalculo: number;
}

export default function GerarLivroFiscalDialog({ open, onOpenChange, initialRows = [] }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<FiscalRow[]>(initialRows);

  // Update rows when initialRows changes (when modal opens)
  useEffect(() => {
    if (open) {
      setRows(initialRows);
    }
  }, [open, initialRows]);
  
  // Header Meta Data
  const [empresa, setEmpresa] = useState('CASANA');
  const [inscEst, setInscEst] = useState('069309272');
  const [cnpjEmpresa, setCnpjEmpresa] = useState('19.671.349/0001-83');
  const [livroNo, setLivroNo] = useState('0001');
  const [folha, setFolha] = useState('0001');

  const formatFiscalDate = (isoDate: string) => {
    if (!isoDate) return '--/--/--';
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '--/--/--';
    return format(d, 'dd/MM/yy');
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newRows: FiscalRow[] = [];
    const todayStr = format(new Date(), 'dd/MM/yy');

    for (const file of files) {
      try {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/xml');

        const nNF = doc.getElementsByTagName('nNF')[0]?.textContent?.trim() || '-';
        const serie = doc.getElementsByTagName('serie')[0]?.textContent?.trim() || '1';
        const dhEmi = formatFiscalDate(doc.getElementsByTagName('dhEmi')[0]?.textContent || '');
        
        const emit = doc.getElementsByTagName('emit')[0];
        const cnpjRaw = emit?.getElementsByTagName('CNPJ')[0]?.textContent?.trim() || '-';
        const uf = emit?.getElementsByTagName('UF')[0]?.textContent?.trim() || '-';
        
        const vNF = Number(doc.getElementsByTagName('ICMSTot')[0]?.getElementsByTagName('vNF')[0]?.textContent || '0');
        const cfop = doc.getElementsByTagName('det')[0]?.getElementsByTagName('CFOP')[0]?.textContent?.trim() || '-';

        const cnpj = cnpjRaw.length === 14 
          ? cnpjRaw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
          : cnpjRaw;

        newRows.push({
          filename: file.name,
          dataEntrada: todayStr,
          especie: '', // Geralmente vazio em NF-e
          nNF,
          serie: (serie.length > 0 ? serie + '/' : ''),
          dataDoc: dhEmi,
          cnpjEmit: cnpj,
          uf,
          vNF,
          cfop,
          imposto: 'ICMS',
          codigoA: '3',
          bCalculo: vNF // Conforme imagem, o valor contábil repete na base de cálculo se o código for 3
        });

      } catch (err) {
        console.error("Erro lendo ", file.name, err);
      }
    }
    
    // Sort by entry date (newest first)
    setRows(prev => [...prev, ...newRows].sort((a,b) => b.dataEntrada.localeCompare(a.dataEntrada)));
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleGenerate = () => {
    if (rows.length === 0) {
      toast.error('Nenhum XML carregado.');
      return;
    }

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    const contentWidth = pageWidth - (margin * 2);

    const getPeriodStr = () => {
      const dates = rows.map(r => {
        const parts = r.dataDoc.split('/');
        return new Date(2000 + parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }).filter(d => !isNaN(d.getTime()));
      
      if (dates.length === 0) return format(new Date(), 'dd/MM/yyyy');
      
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      
      return `${format(startOfMonth(minDate), 'dd/MM/yyyy')} a ${format(endOfMonth(maxDate), 'dd/MM/yyyy')}`;
    };

    const drawPageHeader = () => {
      // Main Box
      doc.setDrawColor(0);
      doc.setLineWidth(0.1);
      doc.rect(margin, margin, contentWidth, 25);
      
      // Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("LIVRO DE ENTRADAS", pageWidth / 2, margin + 5, { align: 'center' });
      
      // Company Details Left
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Empresa:  ${empresa}`, margin + 5, margin + 12);
      doc.text(`Insc. Est.: ${inscEst}`, margin + 5, margin + 17);
      doc.text(`Folha:      ${folha}`, margin + 5, margin + 22);
      
      // Company Details Right
      doc.text(`CNPJ:     ${cnpjEmpresa}`, margin + contentWidth - 55, margin + 12);
      doc.text(`Livro Nº:  ${livroNo}`, margin + contentWidth - 55, margin + 17);
      doc.text(`Período:   ${getPeriodStr()}`, margin + contentWidth - 55, margin + 22);

      // Fiscal Codes Bar
      doc.rect(margin, margin + 25, contentWidth, 8);
      doc.setFontSize(7.5);
      doc.text("Códigos de valores fiscais: 1 - Op. c/ crédito de imposto    2 - Op. s/ crédito de imposto - isentas/não trib.    3 - Op. s/ crédito de imposto - outras", margin + 2, margin + 30);
    };

    const formatCurr = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const tableRows = rows.map(r => [
      r.dataEntrada,
      r.especie,
      r.nNF,
      r.serie,
      r.dataDoc,
      r.cnpjEmit,
      r.uf,
      formatCurr(r.vNF),
      r.cfop,
      r.imposto,
      r.codigoA,
      formatCurr(r.bCalculo),
      '',
      '',
      ''
    ]);

    autoTable(doc, {
      startY: 43,
      margin: { left: margin, right: margin },
      head: [
        [
          { content: 'DATA\nENTRADA', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
          { content: 'DOCUMENTOS FISCAIS', colSpan: 6, styles: { halign: 'center' } },
          { content: 'VALOR\nCONTÁBIL', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
          { content: 'CODIFICAÇÃO', colSpan: 3, styles: { halign: 'center' } },
          { content: 'VALORES FISCAIS', colSpan: 4, styles: { halign: 'center' } }
        ],
        [
          'ESPÉCIE', 'NÚMERO', 'SERIE\nS.SERIE', 'DATA\nDOC.', 'CÓDIGO EMITENTE', 'UF\nOR.',
          'CFOP', 'ICMS', 'CÓD.\n(a)',
          'B. CÁLCULO\nV. OPERAÇÃO', 'ALIQ', 'IMPOSTO\nCREDITADO', 'OBSERVAÇÕES'
        ]
      ],
      body: tableRows,
      theme: 'grid',
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        lineColor: [0, 0, 0],
        lineWidth: 0.1,
        textColor: [0, 0, 0],
        font: "helvetica"
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontSize: 6,
        fontStyle: 'bold',
        lineWidth: 0.1
      },
      columnStyles: {
        0: { cellWidth: 15 }, // data entrada
        1: { cellWidth: 12 }, // especie
        2: { cellWidth: 15, halign: 'right' }, // numero
        3: { cellWidth: 12, halign: 'center' }, // serie
        4: { cellWidth: 15, halign: 'center' }, // data doc
        5: { cellWidth: 35 }, // cnpj emit
        6: { cellWidth: 8, halign: 'center' }, // uf
        7: { cellWidth: 20, halign: 'right' }, // valor contabil
        8: { cellWidth: 10, halign: 'center' }, // cfop
        9: { cellWidth: 10, halign: 'center' }, // icms
        10: { cellWidth: 8, halign: 'center' }, // cod a
        11: { cellWidth: 20, halign: 'right' }, // b calculo
        12: { cellWidth: 10 }, // aliq
        13: { cellWidth: 18 }, // imposto creditado
        14: { cellWidth: 'auto' } // observacoes
      },
      didDrawPage: (data) => {
        drawPageHeader();
      }
    });

    doc.save(`livro-fiscal-entradas-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
    toast.success('Livro Fiscal gerado com sucesso!');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if(!v) setRows([]); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerador de Livro Fiscal - Estilo Oficial</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 border-b pb-4 mb-2">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">Nome Empresa</label>
            <Input className="h-9 text-sm" value={empresa} onChange={e => setEmpresa(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">CNPJ da Empresa</label>
            <Input className="h-9 text-sm" value={cnpjEmpresa} onChange={e => setCnpjEmpresa(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">Insc. Estadual</label>
            <Input className="h-9 text-sm" value={inscEst} onChange={e => setInscEst(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">Livro Nº</label>
              <Input className="h-9 text-sm" value={livroNo} onChange={e => setLivroNo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">Pág / Folha</label>
              <Input className="h-9 text-sm" value={folha} onChange={e => setFolha(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-primary/20 rounded-2xl bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-8 w-8 text-primary mb-2" />
            <p className="text-xs font-semibold">Subir XMLs do Período</p>
            <input ref={fileRef} type="file" accept=".xml" multiple className="hidden" onChange={handleFiles} />
          </div>

          {rows.length > 0 && (
            <div className="space-y-4 pt-2 border-t">
              <div className="bg-muted/30 p-2 text-[11px] font-mono space-y-1 rounded-xl max-h-[160px] overflow-y-auto border border-border/50">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 p-1.5 hover:bg-white/50 rounded border-b border-border/20 last:border-0">
                    <span className="bg-primary/10 text-primary px-1.5 rounded text-[9px] font-bold h-4 flex items-center">XML</span>
                    <span className="truncate flex-1 font-medium">{r.nNF} - {r.cnpjEmit.substring(0,8)}...</span>
                    <span className="text-muted-foreground shrink-0 font-bold">R$ {r.vNF.toLocaleString('pt-BR')}</span>
                  </div>
                ))}
              </div>

              <Button onClick={handleGenerate} className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20">
                <Download className="h-5 w-5 mr-2" />
                BAIXAR LIVRO FISCAL DE ENTRADAS
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
