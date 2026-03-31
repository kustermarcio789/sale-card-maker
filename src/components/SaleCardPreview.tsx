import { SaleData } from "@/types/sales";

interface SaleCardPreviewProps {
  sale: SaleData;
}

export function SaleCardPreview({ sale }: SaleCardPreviewProps) {
  const productImageSrc = sale.productImageData || sale.productImageUrl;

  return (
    <div className="glass-card p-4 animate-fade-in">
      <div className="rounded-2xl border border-border/70 bg-card shadow-sm overflow-hidden">
        <div className="flex flex-col md:flex-row">
          <div className="md:w-44 border-b md:border-b-0 md:border-r border-border/70 bg-secondary/40 flex items-center justify-center p-5">
            <div className="w-32 h-32 rounded-full border-4 border-white shadow-md overflow-hidden bg-background">
              <img
                src={productImageSrc || "/placeholder.svg"}
                alt={sale.productName || "Produto"}
                className="w-full h-full object-cover"
                onError={(event) => {
                  (event.target as HTMLImageElement).src = "/placeholder.svg";
                }}
              />
            </div>
          </div>

          <div className="flex-1 p-5 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-bold bg-primary/10 text-primary px-3 py-1 rounded-full">
                  SKU: {sale.sku || "-"}
                </span>
                <span className="text-sm text-muted-foreground">{sale.quantity} unidade(s)</span>
              </div>

              <div>
                <p className="text-lg font-bold text-foreground leading-tight">
                  {sale.productName || "Produto sem nome"}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xl font-semibold text-foreground">#{sale.saleNumber || "-"}</p>
                <p className="text-sm text-muted-foreground">
                  {sale.saleDate || "-"} {sale.saleTime || ""}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Cliente</p>
                <p className="text-xl font-bold text-foreground truncate">
                  {sale.customerName || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Nickname</p>
                <p className="text-xl font-bold text-foreground truncate">
                  {sale.customerNickname || "-"}
                </p>
              </div>
            </div>
          </div>

          <div className="md:w-40 border-t md:border-t-0 md:border-l border-border/70 bg-secondary/30 p-4 flex md:flex-col items-center justify-center gap-4">
            <div className="text-center">
              <div className="w-24 h-12 bg-white rounded-md border border-border flex items-center justify-center shadow-sm">
                <span className="text-[9px] font-mono tracking-[0.25em] text-muted-foreground">
                  BARCODE
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                {sale.barcodeValue || "-"}
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-white rounded-md border border-border flex items-center justify-center shadow-sm">
                <span className="text-[10px] font-mono text-muted-foreground">QR</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                {sale.qrcodeValue || "-"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
