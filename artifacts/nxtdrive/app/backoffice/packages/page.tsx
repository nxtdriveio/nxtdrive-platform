import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  formatEuros,
  OFFERING_CATEGORIES,
  OFFERING_CATEGORY_LABEL,
  type Package,
  type PackageProduct,
  type Product,
} from "@/lib/packages/types";
import { formatTegoed } from "@/lib/students/types";
import {
  addPackageProduct,
  createPackage,
  createProduct,
  removePackageProduct,
  togglePackageActive,
  toggleProductActive,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const supabase = await createServerSupabaseClient();
  const [packagesRes, productsRes, linksRes] = await Promise.all([
    supabase
      .from("packages")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("active", { ascending: false })
      .order("credits_total", { ascending: true }),
    supabase
      .from("products")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("active", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("package_products")
      .select("*")
      .eq("tenant_id", tenant.id),
  ]);
  const packages = (packagesRes.data ?? []) as Package[];
  const products = (productsRes.data ?? []) as Product[];
  const links = (linksRes.data ?? []) as PackageProduct[];

  const productById = new Map(products.map((p) => [p.id, p]));
  const linksByPackage = new Map<string, PackageProduct[]>();
  for (const link of links) {
    const list = linksByPackage.get(link.package_id) ?? [];
    list.push(link);
    linksByPackage.set(link.package_id, list);
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Pakketten &amp; producten
        </h1>
        <p className="text-sm text-muted-foreground">
          Stel je aanbod samen: uren-pakketten en losse producten met prijs en
          eventueel tegoed (uren).
        </p>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Packages                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Pakketten</h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card className="overflow-hidden">
              {packages.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  Nog geen pakketten — maak er rechts één aan.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Naam</th>
                      <th className="px-4 py-3 font-medium">Soort</th>
                      <th className="px-4 py-3 font-medium">Uren</th>
                      <th className="px-4 py-3 font-medium">Prijs</th>
                      <th className="px-4 py-3 font-medium">Geldigheid</th>
                      <th className="px-4 py-3 font-medium">Zichtbaar</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {packages.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {p.name}
                          {!p.auto_grant ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              · tegoed uitgesteld
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {OFFERING_CATEGORY_LABEL[p.category]}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatTegoed(p.credits_total)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatEuros(p.price_cents)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.valid_days ? `${p.valid_days} dagen` : "Onbeperkt"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {[
                            p.visible_on_website ? "Web" : null,
                            p.visible_in_app ? "App" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {p.active ? (
                            <Badge variant="success">Actief</Badge>
                          ) : (
                            <Badge variant="warning">Inactief</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <form action={togglePackageActive}>
                            <input
                              type="hidden"
                              name="package_id"
                              value={p.id}
                            />
                            <Button type="submit" variant="ghost" size="sm">
                              {p.active ? "Deactiveren" : "Activeren"}
                            </Button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Nieuw pakket</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createPackage} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Naam</Label>
                  <Input
                    id="name"
                    name="name"
                    required
                    placeholder="bv. Standaardpakket"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="category">Soort</Label>
                  <select
                    id="category"
                    name="category"
                    defaultValue="pakket"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  >
                    {OFFERING_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {OFFERING_CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="credits_total">Uren</Label>
                    <Input
                      id="credits_total"
                      name="credits_total"
                      type="number"
                      step="0.5"
                      min={0.5}
                      required
                      placeholder="30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="price_euros">Prijs (€)</Label>
                    <Input
                      id="price_euros"
                      name="price_euros"
                      type="number"
                      step="0.01"
                      min={0}
                      required
                      placeholder="1800.00"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="valid_days">
                    Geldig (dagen, leeg = onbeperkt)
                  </Label>
                  <Input
                    id="valid_days"
                    name="valid_days"
                    type="number"
                    min={1}
                    placeholder="365"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signal_threshold_hours">
                    Signaal bij verbruik (uren, leeg = uit)
                  </Label>
                  <Input
                    id="signal_threshold_hours"
                    name="signal_threshold_hours"
                    type="number"
                    step="0.5"
                    min={0.5}
                    placeholder="bv. 25"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="terms">Voorwaarden (optioneel)</Label>
                  <textarea
                    id="terms"
                    name="terms"
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                    placeholder="bv. Geldig op werkdagen"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="installment_count"
                      className="flex items-center gap-2"
                    >
                      <input
                        type="checkbox"
                        name="installments_enabled"
                        value="1"
                        className="h-4 w-4"
                      />
                      Termijnen
                    </Label>
                    <Input
                      id="installment_count"
                      name="installment_count"
                      type="number"
                      min={2}
                      placeholder="aantal"
                    />
                  </div>
                  <div className="flex flex-col justify-end gap-2 pb-1 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="auto_grant"
                        value="1"
                        defaultChecked
                        className="h-4 w-4"
                      />
                      Tegoed direct toekennen
                    </label>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="visible_on_website"
                      value="1"
                      className="h-4 w-4"
                    />
                    Op website
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="visible_in_app"
                      value="1"
                      defaultChecked
                      className="h-4 w-4"
                    />
                    In app
                  </label>
                </div>
                <Button type="submit" size="sm" className="w-full">
                  Pakket aanmaken
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Products                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Producten</h2>
        <p className="text-sm text-muted-foreground">
          Losse producten (proefles, losse rijles, examen, …). Een product kan
          optioneel tegoed (uren) bevatten.
        </p>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card className="overflow-hidden">
              {products.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  Nog geen producten — maak er rechts één aan.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Naam</th>
                      <th className="px-4 py-3 font-medium">Soort</th>
                      <th className="px-4 py-3 font-medium">Tegoed</th>
                      <th className="px-4 py-3 font-medium">Prijs</th>
                      <th className="px-4 py-3 font-medium">Zichtbaar</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {products.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {p.name}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {OFFERING_CATEGORY_LABEL[p.category]}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.credit_minutes
                            ? formatTegoed(p.credit_minutes)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatEuros(p.price_cents)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {[
                            p.visible_on_website ? "Web" : null,
                            p.visible_in_app ? "App" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {p.active ? (
                            <Badge variant="success">Actief</Badge>
                          ) : (
                            <Badge variant="warning">Inactief</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <form action={toggleProductActive}>
                            <input
                              type="hidden"
                              name="product_id"
                              value={p.id}
                            />
                            <Button type="submit" variant="ghost" size="sm">
                              {p.active ? "Deactiveren" : "Activeren"}
                            </Button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Nieuw product</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createProduct} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="product_name">Naam</Label>
                  <Input
                    id="product_name"
                    name="name"
                    required
                    placeholder="bv. Losse rijles"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="product_category">Soort</Label>
                  <select
                    id="product_category"
                    name="category"
                    defaultValue="los"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  >
                    {OFFERING_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {OFFERING_CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="credit_hours">Tegoed (uren, leeg = geen)</Label>
                    <Input
                      id="credit_hours"
                      name="credit_hours"
                      type="number"
                      step="0.5"
                      min={0.5}
                      placeholder="1"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="product_price">Prijs (€)</Label>
                    <Input
                      id="product_price"
                      name="price_euros"
                      type="number"
                      step="0.01"
                      min={0}
                      required
                      placeholder="65.00"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description">Omschrijving (optioneel)</Label>
                  <textarea
                    id="description"
                    name="description"
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                    placeholder="Korte omschrijving"
                  />
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="visible_on_website"
                      value="1"
                      className="h-4 w-4"
                    />
                    Op website
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="visible_in_app"
                      value="1"
                      defaultChecked
                      className="h-4 w-4"
                    />
                    In app
                  </label>
                </div>
                <Button type="submit" size="sm" className="w-full">
                  Product aanmaken
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Included products per package                                     */}
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          Inbegrepen producten per pakket
        </h2>
        <p className="text-sm text-muted-foreground">
          Koppel losse producten aan een pakket om het aanbod als bundel te
          tonen. Dit is informatief — het tegoed van een pakket wordt bepaald
          door de uren van het pakket zelf, niet door de gekoppelde producten.
        </p>
        {packages.length === 0 ? (
          <Card>
            <div className="p-10 text-center text-sm text-muted-foreground">
              Maak eerst een pakket aan.
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {packages.map((pkg) => {
              const pkgLinks = linksByPackage.get(pkg.id) ?? [];
              return (
                <Card key={pkg.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{pkg.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {pkgLinks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nog geen inbegrepen producten.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border text-sm">
                        {pkgLinks.map((link) => {
                          const prod = productById.get(link.product_id);
                          return (
                            <li
                              key={link.id}
                              className="flex items-center justify-between py-2"
                            >
                              <span className="text-foreground">
                                {link.quantity}×{" "}
                                {prod?.name ?? "Onbekend product"}
                              </span>
                              <form action={removePackageProduct}>
                                <input
                                  type="hidden"
                                  name="package_product_id"
                                  value={link.id}
                                />
                                <Button
                                  type="submit"
                                  variant="ghost"
                                  size="sm"
                                >
                                  Verwijderen
                                </Button>
                              </form>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {products.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Maak eerst producten aan om te koppelen.
                      </p>
                    ) : (
                      <form
                        action={addPackageProduct}
                        className="flex items-end gap-2"
                      >
                        <input
                          type="hidden"
                          name="package_id"
                          value={pkg.id}
                        />
                        <div className="flex-1 space-y-1.5">
                          <Label htmlFor={`product-${pkg.id}`}>Product</Label>
                          <select
                            id={`product-${pkg.id}`}
                            name="product_id"
                            required
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                          >
                            {products.map((prod) => (
                              <option key={prod.id} value={prod.id}>
                                {prod.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-20 space-y-1.5">
                          <Label htmlFor={`qty-${pkg.id}`}>Aantal</Label>
                          <Input
                            id={`qty-${pkg.id}`}
                            name="quantity"
                            type="number"
                            min={1}
                            defaultValue={1}
                          />
                        </div>
                        <Button type="submit" size="sm">
                          Koppelen
                        </Button>
                      </form>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
