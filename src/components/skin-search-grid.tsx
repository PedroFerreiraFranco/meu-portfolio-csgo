"use client";

import { useEffect, useMemo, useState } from "react";
import { CSGO_ENDPOINTS, type EndpointKey } from "@/lib/csgo-endpoints";
import type { CsgoApiItem } from "@/lib/types";

type CacheMap = Partial<Record<EndpointKey, CsgoApiItem[]>>;
type WearOption = { label: string; item: CsgoApiItem };
type DisplayItem = {
  id: string;
  baseName: string;
  image?: string;
  rarity?: CsgoApiItem["rarity"];
  sourceItem: CsgoApiItem;
  wearOptions: WearOption[];
};

const ALL = "all";
const WEAR_ORDER = [
  "Factory New",
  "Minimal Wear",
  "Field-Tested",
  "Well-Worn",
  "Battle-Scarred",
];

function normalizeWearLabel(label: string): string {
  if (label === "Field Tested") return "Field-Tested";
  if (label === "Well Worm") return "Well-Worn";
  if (label === "Battle Scarred") return "Battle-Scarred";
  return label;
}

function getWearRank(label: string): number {
  const index = WEAR_ORDER.indexOf(normalizeWearLabel(label));
  return index === -1 ? WEAR_ORDER.length + 1 : index;
}

function stripWearSuffix(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "");
}

function extractWearFromName(name: string): string | null {
  const match = name.match(/\(([^)]+)\)\s*$/);
  return match?.[1] ?? null;
}

function normalizeResponse(payload: unknown): CsgoApiItem[] {
  if (Array.isArray(payload)) {
    return payload as CsgoApiItem[];
  }

  if (payload && typeof payload === "object") {
    return Object.values(payload as Record<string, CsgoApiItem>);
  }

  return [];
}

function getSkinClass(item: CsgoApiItem): string {
  return item.category?.name ?? "Unknown";
}

function getWeaponName(item: CsgoApiItem): string {
  return item.weapon?.name ?? "Unknown";
}

export default function SkinSearchGrid() {
  const [busca, setBusca] = useState("");
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointKey>("skins_not_grouped");
  const [items, setItems] = useState<CsgoApiItem[]>([]);
  const [cache, setCache] = useState<CacheMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openedItem, setOpenedItem] = useState<DisplayItem | null>(null);
  const [selectedWear, setSelectedWear] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<CsgoApiItem | null>(null);

  const [skinClassFilter, setSkinClassFilter] = useState(ALL);
  const [weaponFilter, setWeaponFilter] = useState(ALL);
  const [rarityFilter, setRarityFilter] = useState(ALL);
  const [wearFilter, setWearFilter] = useState(ALL);

  const isSkinEndpoint = selectedEndpoint === "skins_not_grouped";

  useEffect(() => {
    setOpenedItem(null);
    setSelectedWear("");
    setSkinClassFilter(ALL);
    setWeaponFilter(ALL);
    setRarityFilter(ALL);
    setWearFilter(ALL);
  }, [selectedEndpoint]);

  useEffect(() => {
    const cached = cache[selectedEndpoint];
    if (cached) {
      setItems(cached);
      setLoading(false);
      setError(null);
      return;
    }

    const endpoint = CSGO_ENDPOINTS.find((entry) => entry.key === selectedEndpoint);
    if (!endpoint) {
      setItems([]);
      setLoading(false);
      setError("Endpoint inválido.");
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(endpoint.url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Falha ao carregar ${endpoint.label}.`);
        }
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        const data = normalizeResponse(payload);
        setItems(data);
        setCache((prev) => ({ ...prev, [selectedEndpoint]: data }));
      })
      .catch((fetchError: unknown) => {
        if ((fetchError as { name?: string }).name === "AbortError") {
          return;
        }
        setItems([]);
        setError("Não foi possível buscar os dados da CSGO-API.");
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [selectedEndpoint, cache]);

  const displayItems = useMemo<DisplayItem[]>(() => {
    if (selectedEndpoint === "skins_not_grouped") {
      const grouped = new Map<string, DisplayItem>();

      for (const item of items) {
        const key = item.skin_id ?? stripWearSuffix(item.name).toLowerCase();
        const wearName = item.wear?.name ?? extractWearFromName(item.name);
        const wearOption: WearOption | null = wearName
          ? { label: normalizeWearLabel(wearName), item }
          : null;
        const existing = grouped.get(key);

        if (!existing) {
          grouped.set(key, {
            id: key,
            baseName: stripWearSuffix(item.name),
            image: item.image,
            rarity: item.rarity,
            sourceItem: item,
            wearOptions: wearOption ? [wearOption] : [],
          });
          continue;
        }

        if (wearOption && !existing.wearOptions.some((option) => option.label === wearOption.label)) {
          existing.wearOptions.push(wearOption);
        }
      }

      return Array.from(grouped.values()).map((groupedItem) => ({
        ...groupedItem,
        wearOptions: [...groupedItem.wearOptions].sort(
          (a, b) => getWearRank(a.label) - getWearRank(b.label),
        ),
      }));
    }

    return items.map((item) => ({
      id: item.id,
      baseName: item.name,
      image: item.image,
      rarity: item.rarity,
      sourceItem: item,
      wearOptions: [],
    }));
  }, [items, selectedEndpoint]);

  const baseBySearch = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return displayItems.filter((item) => item.baseName.toLowerCase().includes(termo));
  }, [displayItems, busca]);

  const skinClasses = useMemo(
    () => Array.from(new Set(baseBySearch.map((item) => getSkinClass(item.sourceItem)))).sort(),
    [baseBySearch],
  );

  const afterClass = useMemo(
    () =>
      baseBySearch.filter((item) =>
        skinClassFilter === ALL ? true : getSkinClass(item.sourceItem) === skinClassFilter,
      ),
    [baseBySearch, skinClassFilter],
  );

  const weapons = useMemo(
    () => Array.from(new Set(afterClass.map((item) => getWeaponName(item.sourceItem)))).sort(),
    [afterClass],
  );

  const afterWeapon = useMemo(
    () =>
      afterClass.filter((item) =>
        weaponFilter === ALL ? true : getWeaponName(item.sourceItem) === weaponFilter,
      ),
    [afterClass, weaponFilter],
  );

  const rarities = useMemo(
    () =>
      Array.from(
        new Set(afterWeapon.map((item) => item.rarity?.name).filter((rarity): rarity is string => Boolean(rarity))),
      ).sort(),
    [afterWeapon],
  );

  const afterRarity = useMemo(
    () =>
      afterWeapon.filter((item) =>
        rarityFilter === ALL ? true : item.rarity?.name === rarityFilter,
      ),
    [afterWeapon, rarityFilter],
  );

  const wears = useMemo(() => {
    const names = new Set<string>();
    for (const item of afterRarity) {
      for (const option of item.wearOptions) {
        names.add(option.label);
      }
    }
    return Array.from(names).sort((a, b) => getWearRank(a) - getWearRank(b));
  }, [afterRarity]);

  const itensFiltrados = useMemo(() => {
    const filtered = afterRarity.filter((item) =>
      wearFilter === ALL ? true : item.wearOptions.some((option) => option.label === wearFilter),
    );

    if (wearFilter === ALL) {
      return filtered;
    }

    return filtered.map((item) => {
      const wearMatch = item.wearOptions.find((option) => option.label === wearFilter);
      if (!wearMatch) {
        return item;
      }

      return {
        ...item,
        image: wearMatch.item.image ?? item.image,
        sourceItem: wearMatch.item,
      };
    });
  }, [afterRarity, wearFilter]);

  const selectedLabel =
    CSGO_ENDPOINTS.find((endpoint) => endpoint.key === selectedEndpoint)?.label ?? "Itens";

  function openWearModal(item: DisplayItem) {
    if (item.wearOptions.length === 0) {
      setSelectedItem(item.sourceItem);
      return;
    }

    const preferredWear =
      wearFilter !== ALL
        ? item.wearOptions.find((option) => option.label === wearFilter)?.label
        : item.wearOptions[0]?.label;

    const preferredItem =
      item.wearOptions.find((option) => option.label === preferredWear)?.item ??
      item.wearOptions[0]?.item ??
      null;

    setOpenedItem(item);
    setSelectedWear(preferredWear ?? "");
    if (preferredItem) {
      setSelectedItem(preferredItem);
    }
  }

  const activeWearItem =
    openedItem?.wearOptions.find((option) => option.label === selectedWear)?.item ??
    openedItem?.wearOptions[0]?.item ??
    null;

  const selectedLabelText = selectedItem
    ? `${stripWearSuffix(selectedItem.name)}${selectedItem.wear?.name ? ` (${selectedItem.wear.name})` : ""}`
    : null;

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-10 text-center">
          <h1 className="mb-2 text-4xl font-black uppercase tracking-tighter text-white">
            CS:GO <span className="text-orange-500">Inventory</span>
          </h1>
          <p className="text-slate-400">Filtre skins e outros itens da CSGO-API</p>
        </header>

        <div className="mb-8 flex flex-wrap gap-2">
          {CSGO_ENDPOINTS.map((endpoint) => (
            <button
              key={endpoint.key}
              type="button"
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                selectedEndpoint === endpoint.key
                  ? "border-orange-500 bg-orange-500/15 text-orange-400"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
              }`}
              onClick={() => setSelectedEndpoint(endpoint.key)}
            >
              {endpoint.label}
            </button>
          ))}
        </div>

        <div className="relative mx-auto mb-6 max-w-xl">
          <input
            type="text"
            placeholder={`Procure em ${selectedLabel}...`}
            className="w-full rounded-xl border-2 border-slate-800 bg-slate-900 p-4 pl-12 text-white transition-colors focus:border-orange-500 focus:outline-none"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <span className="absolute left-4 top-4 text-slate-500">🔍</span>
        </div>

        {isSkinEndpoint && (
          <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="mb-3 grid gap-2 text-xs font-semibold text-slate-300 sm:grid-cols-5">
              <p>Total busca: {baseBySearch.length}</p>
              <p>Após classe: {afterClass.length}</p>
              <p>Após arma: {afterWeapon.length}</p>
              <p>Após raridade: {afterRarity.length}</p>
              <p>Resultado final: {itensFiltrados.length}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <select
                value={skinClassFilter}
                onChange={(e) => {
                  setSkinClassFilter(e.target.value);
                  setWeaponFilter(ALL);
                  setRarityFilter(ALL);
                  setWearFilter(ALL);
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                <option value={ALL}>Classe (todas)</option>
                {skinClasses.map((skinClass) => (
                  <option key={skinClass} value={skinClass}>
                    {skinClass}
                  </option>
                ))}
              </select>

              <select
                value={weaponFilter}
                onChange={(e) => {
                  setWeaponFilter(e.target.value);
                  setRarityFilter(ALL);
                  setWearFilter(ALL);
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                <option value={ALL}>Arma (todas)</option>
                {weapons.map((weapon) => (
                  <option key={weapon} value={weapon}>
                    {weapon}
                  </option>
                ))}
              </select>

              <select
                value={rarityFilter}
                onChange={(e) => {
                  setRarityFilter(e.target.value);
                  setWearFilter(ALL);
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                <option value={ALL}>Raridade (todas)</option>
                {rarities.map((rarity) => (
                  <option key={rarity} value={rarity}>
                    {rarity}
                  </option>
                ))}
              </select>

              <select
                value={wearFilter}
                onChange={(e) => setWearFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                <option value={ALL}>Desgaste (todos)</option>
                {wears.map((wear) => (
                  <option key={wear} value={wear}>
                    {wear}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {loading && <p className="mb-8 text-center text-slate-400">Carregando {selectedLabel}...</p>}
        {error && <p className="mb-8 text-center text-red-400">{error}</p>}
        {selectedLabelText && (
          <p className="mb-8 rounded-lg border border-emerald-700 bg-emerald-950/40 px-4 py-3 text-center text-emerald-300">
            Item selecionado: <span className="font-semibold">{selectedLabelText}</span>
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {itensFiltrados.slice(0, 24).map((item) => (
            <div
              key={item.id}
              className="group cursor-pointer overflow-hidden rounded-2xl border-b-4 bg-slate-900 shadow-xl transition-all duration-300 hover:-translate-y-2"
              style={{ borderBottomColor: item.rarity?.color ?? "#334155" }}
              onClick={() => openWearModal(item)}
            >
              <div className="relative flex h-48 items-center justify-center bg-gradient-to-b from-slate-800 to-transparent p-4">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.baseName}
                    className="h-full w-full object-contain drop-shadow-2xl transition-transform group-hover:scale-110"
                  />
                ) : (
                  <span className="text-sm font-semibold text-slate-500">Sem imagem</span>
                )}
              </div>

              <div className="p-5">
                <h2 className="mb-1 truncate text-lg font-bold leading-tight text-white">{item.baseName}</h2>
                {item.rarity ? (
                  <p
                    className="inline-block rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-widest"
                    style={{
                      backgroundColor: `${item.rarity.color}22`,
                      color: item.rarity.color,
                    }}
                  >
                    {item.rarity.name}
                  </p>
                ) : (
                  <p className="inline-block rounded-md bg-slate-800 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Sem raridade
                  </p>
                )}
                {item.wearOptions.length > 0 && (
                  <p className="mt-2 text-xs font-semibold text-slate-400">
                    {item.wearOptions.length} níveis de desgaste
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {!loading && !error && itensFiltrados.length === 0 && (
          <p className="mt-20 text-center text-slate-500">
            Nenhum item encontrado em {selectedLabel} para "{busca}"
          </p>
        )}
      </div>

      {openedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
              <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                <div className="flex h-72 items-center justify-center rounded-lg bg-slate-900">
                  {activeWearItem?.image ? (
                    <img
                      src={activeWearItem.image}
                      alt={openedItem.baseName}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-slate-500">Sem imagem</span>
                  )}
                </div>
                <h3 className="mt-4 text-lg font-bold text-white">{openedItem.baseName}</h3>
                {selectedWear && <p className="text-sm text-orange-400">{selectedWear}</p>}
              </div>

              <div>
                <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
                  Escolha o desgaste
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {openedItem.wearOptions.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                        selectedWear === option.label
                          ? "border-orange-500 bg-orange-500/15 text-orange-400"
                          : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
                      }`}
                      onClick={() => {
                        setSelectedWear(option.label);
                        setSelectedItem(option.item);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-400"
                    onClick={() => {
                      setOpenedItem(null);
                      setSelectedWear("");
                    }}
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
