import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { SaleForm } from "@/components/SaleForm";
import { SaleCardPreview } from "@/components/SaleCardPreview";
import { useExtraction } from "@/contexts/ExtractionContext";
import { mockSales } from "@/data/mockData";
import { SaleData } from "@/types/sales";
import { Button } from "@/components/ui/button";
import {
  Eye,
  Download,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  Info,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { exportSalePdf, exportBatchPdf } from "@/services/pdfExportService";

export default function ReviewPage() {
  const [exporting, setExporting] = useState(false);
  const { results } = useExtraction();

  const hasRealData = results.length > 0;
  const [sales, setSales] = useState<SaleData[]>(
    hasRealData ? results.map((result) => result.sale) : [...mockSales]
  );
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setSales(hasRealData ? results.map((result) => result.sale) : [...mockSales]);
    setCurrentIndex(0);
  }, [hasRealData, results]);

  const currentSale = sales[currentIndex];
  const currentResult = hasRealData ? results[currentIndex] : null;

  const updateSale = (updated: SaleData) => {
    const synced = {
      ...updated,
      barcodeValue: updated.sku,
      qrcodeValue: updated.sku,
      saleQrcodeValue: updated.saleNumber,
    };

    setSales((previous) =>
      previous.map((sale, index) => (index === currentIndex ? synced : sale))
    );
  };

  const handleExport = async () => {
    if (!currentSale) return;

    setExporting(true);
    try {
      await exportSalePdf(currentSale);
      toast.success("PDF gerado com sucesso!", {
        description: `Etiqueta para venda ${currentSale.saleNumber || "(sem numero)"} exportada.`,
      });
    } catch {
      toast.error("Erro ao gerar PDF");
    } finally {
      setExporting(false);
    }
  };

  const handleBatchExport = async () => {
    setExporting(true);
    try {
      await exportBatchPdf(sales);
      toast.success(`${sales.length} etiquetas exportadas em lote!`);
    } catch {
      toast.error("Erro ao gerar PDF em lote");
    } finally {
      setExporting(false);
    }
  };

  const confidenceColor = (level: string) => {
    switch (level) {
      case "high":
        return "default" as const;
      case "medium":
        return "secondary" as const;
      case "low":
        return "outline" as const;
      case "empty":
        return "destructive" as const;
      default:
        return "secondary" as const;
    }
  };

  const emptyFields = currentResult
    ? Object.entries(currentResult.confidence).filter(([, value]) => value === "empty" || value === "low")
    : [];

  const methodLabel =
    currentResult?.method === "mercado-livre"
      ? "Mercado Livre API"
      : currentResult?.method === "pdf-text"
        ? "Parser PDF"
        : "OCR";

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">Conferencia</h1>
              <Badge variant="secondary" className="text-xs">
                {sales.length} venda{sales.length !== 1 ? "s" : ""} detectada{sales.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {hasRealData
                ? "Dados extraidos para revisao antes da exportacao"
                : "Revise e edite os dados antes de gerar o PDF"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((index) => index - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-mono text-muted-foreground px-2">
              {sales.length === 0 ? 0 : currentIndex + 1} / {sales.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentIndex === sales.length - 1 || sales.length === 0}
              onClick={() => setCurrentIndex((index) => index + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {currentResult && (
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Info className="w-4 h-4 text-primary" />
              <span className="font-medium text-foreground">
                Metodo: <Badge variant="secondary" className="ml-1">{methodLabel}</Badge>
              </span>
            </div>

            {emptyFields.length > 0 && (
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-warning mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">
                    {emptyFields.length} campo(s) precisam de revisao:
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {emptyFields.map(([field, level]) => (
                      <Badge key={field} variant={confidenceColor(level)} className="text-[10px]">
                        {field}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {currentSale && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="glass-card p-5 space-y-5">
              <h2 className="text-sm font-semibold text-foreground">Dados extraidos</h2>
              <SaleForm
                sale={currentSale}
                onChange={updateSale}
                confidence={currentResult?.confidence}
              />
            </div>

            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Preview da etiqueta</h2>
              <SaleCardPreview sale={currentSale} />
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => toast.info("Preview em tela cheia em breve!")}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Preview PDF
                </Button>
                <Button
                  className="flex-1 gradient-primary text-primary-foreground"
                  onClick={handleExport}
                  disabled={exporting}
                >
                  {exporting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Exportar PDF
                </Button>
              </div>

              {currentResult?.rawText && (
                <details className="glass-card p-4">
                  <summary className="text-xs font-medium text-muted-foreground cursor-pointer">
                    Ver texto bruto extraido
                  </summary>
                  <pre className="mt-3 text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto font-mono bg-secondary/50 p-3 rounded-lg">
                    {currentResult.rawText}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )}

        {sales.length > 1 && (
          <div className="glass-card p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Exportacao em lote</p>
              <p className="text-xs text-muted-foreground">
                {sales.length} vendas prontas para exportar
              </p>
            </div>
            <Button
              className="gradient-accent text-accent-foreground"
              onClick={handleBatchExport}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Exportar Todas ({sales.length})
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
