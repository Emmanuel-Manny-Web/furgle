import React, { useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Edit3, Trash2, Upload, Image as ImageIcon, Package, TrendingUp, CheckCircle2, ListChecks } from "lucide-react";
import { readCache, writeCache } from "@/hooks/useCachedData";

const blank = {
  name: "", description: "", image_url: "",
  price: 5000, daily_profit_percent: 4, duration_days: 30,
  min_amount: 5000, max_amount: 0, is_active: true,
};

function resolveImg(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("//")) return url;
  return `${process.env.REACT_APP_BACKEND_URL || ""}${url}`;
}

function StatCard({ icon: Icon, label, value, sub, tone, testid }) {
  const tones = {
    purple: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
    green: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
    pink: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]",
    indigo: "bg-[color:var(--brand-soft)] text-[#5B5BD6]",
  };
  return (
    <div className="card-soft p-5" data-testid={testid}>
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${tones[tone]}`}>
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="font-display font-extrabold text-3xl mt-3 text-[color:var(--text-primary)] tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-[color:var(--text-tertiary)] mt-1">{sub}</div>}
    </div>
  );
}

export default function AdminProducts() {
  const [items, setItems] = useState(() => readCache("/admin/products") ?? []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const load = () => api.get("/admin/products").then(({ data }) => { setItems(data); writeCache("/admin/products", data); });
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((p) => p.is_active).length;
    const avgDaily = total ? (items.reduce((acc, p) => acc + Number(p.daily_profit_percent || 0), 0) / total) : 0;
    const totalCatalog = items.reduce((acc, p) => acc + Number(p.price || 0), 0);
    return { total, active, avgDaily, totalCatalog };
  }, [items]);

  const openCreate = () => { setEditing(null); setForm(blank); setOpen(true); };
  const openEdit = (p) => { setEditing(p); setForm({ ...p }); setOpen(true); };

  const uploadImage = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be ≤ 5MB"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/upload-image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, image_url: data.url }));
      toast.success("Image uploaded");
    } catch (e) { toast.error(e?.response?.data?.detail || "Upload failed"); }
    finally { setUploading(false); }
  };

  const save = async () => {
    try {
      const payload = {
        name: form.name, description: form.description, image_url: form.image_url,
        price: Number(form.price), daily_profit_percent: Number(form.daily_profit_percent),
        duration_days: Number(form.duration_days), min_amount: Number(form.min_amount),
        max_amount: Number(form.max_amount), is_active: !!form.is_active,
      };
      if (editing) {
        await api.put(`/admin/products/${editing.id}`, payload);
        toast.success("Product updated");
      } else {
        await api.post("/admin/products", payload);
        toast.success("Product created");
      }
      setOpen(false); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete ${p.name}?`)) return;
    await api.delete(`/admin/products/${p.id}`);
    toast.success("Deleted"); load();
  };

  const toggleActive = async (p) => {
    try {
      await api.put(`/admin/products/${p.id}`, { ...p, is_active: !p.is_active });
      toast.success(p.is_active ? "Hidden from users" : "Now visible to users");
      load();
    } catch { toast.error("Failed"); }
  };

  return (
    <AdminLayout title="">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#5B21B6] via-[#7C3AED] to-[#5B5BD6] text-white p-6 md:p-8" data-testid="products-hero">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-center gap-5">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
            <Package className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-extrabold text-3xl md:text-4xl leading-tight" data-testid="products-title">Products</h1>
            <div className="text-white/80 text-xs md:text-sm mt-1" data-testid="products-subtitle">
              {stats.total} investment plan{stats.total === 1 ? "" : "s"} · {stats.active} active
            </div>
          </div>
          <button onClick={openCreate} data-testid="add-product-btn"
            className="shrink-0 inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur transition-colors text-white px-4 md:px-5 py-2.5 rounded-xl font-semibold text-sm border border-white/30">
            <Plus className="w-4 h-4" /> New Product
          </button>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <StatCard icon={Package} label="Total plans" value={stats.total} tone="purple" testid="stat-total" />
        <StatCard icon={CheckCircle2} label="Active plans" value={stats.active} tone="green" testid="stat-active" />
        <StatCard icon={TrendingUp} label="Avg. daily %" value={`${stats.avgDaily.toFixed(1)}%`} tone="pink" testid="stat-avg-daily" />
        <StatCard icon={ListChecks} label="Total catalog" value={formatNaira(stats.totalCatalog)} sub="Sum of plan prices" tone="indigo" testid="stat-catalog" />
      </div>

      {/* Table */}
      <div className="card-soft overflow-hidden mt-5" data-testid="products-table">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] border-b border-[color:var(--border-default)]">
                <th className="text-left p-4 w-24">Image</th>
                <th className="text-left p-4">Name</th>
                <th className="text-left p-4">Price</th>
                <th className="text-left p-4">Daily %</th>
                <th className="text-left p-4">Duration</th>
                <th className="text-left p-4">Active</th>
                <th className="text-right p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={7} className="p-12 text-center text-[color:var(--text-tertiary)]">No products yet. Click <span className="font-semibold text-[color:var(--brand)]">+ New Product</span> to add your first plan.</td></tr>
              )}
              {items.map((p) => (
                <tr key={p.id} className="border-b border-[color:var(--border-default)] last:border-0 hover:bg-[color:var(--surface-alt)]/40 transition-colors" data-testid={`product-row-${p.id}`}>
                  <td className="p-4">
                    <div className="w-16 h-16 rounded-2xl bg-[color:var(--surface-alt)] flex items-center justify-center overflow-hidden border border-[color:var(--border-default)] shrink-0">
                      {p.image_url ? (
                        <img src={resolveImg(p.image_url)} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-[color:var(--text-tertiary)]" />
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-semibold text-[color:var(--text-primary)]" data-testid={`product-name-${p.id}`}>{p.name}</div>
                    {p.description && <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5 line-clamp-1 max-w-[260px]">{p.description}</div>}
                  </td>
                  <td className="p-4 font-display font-bold tabular-nums text-[color:var(--text-primary)]">{formatNaira(p.price)}</td>
                  <td className="p-4">
                    <span className="font-bold text-[color:var(--accent-main)] tabular-nums">{Number(p.daily_profit_percent).toFixed(0)}%</span>
                  </td>
                  <td className="p-4 text-[color:var(--text-secondary)] tabular-nums">{p.duration_days}d</td>
                  <td className="p-4">
                    <button onClick={() => toggleActive(p)}
                      data-testid={`toggle-active-${p.id}`}
                      className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${p.is_active ? "text-[color:var(--success)]" : "text-[color:var(--text-tertiary)]"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${p.is_active ? "bg-[color:var(--success)]" : "bg-[color:var(--text-tertiary)]"}`} />
                      {p.is_active ? "ACTIVE" : "INACTIVE"}
                    </button>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(p)}
                        data-testid={`edit-product-${p.id}`}
                        title="Edit"
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-[color:var(--accent-main)] hover:bg-[color:var(--accent-soft)] transition-colors">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={() => remove(p)}
                        data-testid={`delete-product-${p.id}`}
                        title="Delete"
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-[color:var(--error)] hover:bg-[color:var(--error-soft)] transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-testid="product-name-input"
              className="md:col-span-2 px-3 py-2.5 input-base" />
            <textarea placeholder="Description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              data-testid="product-description-input"
              className="md:col-span-2 px-3 py-2.5 input-base" />

            <div className="md:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)] mb-2">Product image</div>
              <div className="flex items-start gap-3">
                <div className="w-28 h-28 rounded-lg bg-[color:var(--surface-alt)] flex items-center justify-center overflow-hidden border border-[color:var(--border-default)]">
                  {form.image_url ? (
                    <img src={resolveImg(form.image_url)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-[color:var(--text-tertiary)]" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => uploadImage(e.target.files?.[0])} data-testid="product-image-upload"
                    className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} data-testid="product-image-upload-btn"
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-[color:var(--brand)] text-white rounded-lg hover:bg-[color:var(--brand-hover)] disabled:opacity-60">
                    <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading…" : (form.image_url ? "Replace image" : "Upload image")}
                  </button>
                  <input placeholder="…or paste image URL" value={form.image_url || ""} onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                    data-testid="product-image-input"
                    className="w-full px-3 py-2 input-base text-xs" />
                  <div className="text-[10px] text-[color:var(--text-tertiary)]">JPG / PNG / WebP · max 5MB</div>
                </div>
              </div>
            </div>

            <label className="text-xs"><span>Price (₦)</span>
              <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
                data-testid="product-price-input" className="w-full mt-1 px-3 py-2 input-base" /></label>
            <label className="text-xs"><span>Daily profit %</span>
              <input type="number" step="0.1" value={form.daily_profit_percent} onChange={(e) => setForm({ ...form, daily_profit_percent: e.target.value })}
                data-testid="product-percent-input" className="w-full mt-1 px-3 py-2 input-base" /></label>
            <label className="text-xs"><span>Duration (days)</span>
              <input type="number" value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })}
                data-testid="product-days-input" className="w-full mt-1 px-3 py-2 input-base" /></label>
            <label className="text-xs"><span>Min amount</span>
              <input type="number" value={form.min_amount} onChange={(e) => setForm({ ...form, min_amount: e.target.value })}
                className="w-full mt-1 px-3 py-2 input-base" /></label>
            <label className="text-xs md:col-span-2"><span>Max amount (0 = no cap)</span>
              <input type="number" value={form.max_amount} onChange={(e) => setForm({ ...form, max_amount: e.target.value })}
                className="w-full mt-1 px-3 py-2 input-base" /></label>
            <label className="md:col-span-2 inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} data-testid="product-active-checkbox" />
              Active (visible to users)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="product-save-btn" className="bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
