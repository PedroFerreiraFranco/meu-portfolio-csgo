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
const NO_CSFLOAT_ENDPOINTS = new Set(["graffiti", "highlights", "collections", "keys", "base_weapons"]);
const NO_STEAM_ENDPOINTS = new Set(["collections", "keys", "base_weapons"]);
const WEAR_ORDER = [
  "Factory New",
  "Minimal Wear",
  "Field-Tested",
  "Well-Worn",
  "Battle-Scarred",
];
const WEAR_FLOAT_RANGES: Record<string, { min: number; max: number }> = {
  "Factory New": { min: 0, max: 0.07 },
  "Minimal Wear": { min: 0.07, max: 0.15 },
  "Field-Tested": { min: 0.15, max: 0.38 },
  "Well-Worn": { min: 0.38, max: 0.45 },
  "Battle-Scarred": { min: 0.45, max: 1 },
};

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

function getSteamMarketUrl(item: CsgoApiItem | null): string | null {
  if (!item) return null;
  const marketName = item.market_hash_name?.trim() || item.name?.trim();
  if (!marketName) return null;
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketName)}`;
}

function getCsfloatQueryUrl(item: CsgoApiItem | null): string | null {
  if (!item) return null;
  const marketName = item.market_hash_name?.trim() || item.name?.trim();
  if (!marketName) return null;
  return `https://csfloat.com/search?query=${encodeURIComponent(marketName)}`;
}

function getWearFloatRange(item: CsgoApiItem): { min: number; max: number } | null {
  const wearName = normalizeWearLabel(item.wear?.name ?? extractWearFromName(item.name) ?? "");
  const baseRange = WEAR_FLOAT_RANGES[wearName];
  if (!baseRange) return null;

  const itemMin = typeof item.min_float === "number" ? item.min_float : 0;
  const itemMax = typeof item.max_float === "number" ? item.max_float : 1;
  const min = Math.max(baseRange.min, itemMin);
  const max = Math.min(baseRange.max, itemMax);
  if (min > max) return null;

  return { min, max };
}

function getCsfloatTechnicalUrl(item: CsgoApiItem | null): string | null {
  if (!item) return null;

  const defIndex = item.weapon?.weapon_id?.toString() ?? item.def_index?.toString().trim();
  const paintIndex = item.paint_index?.toString().trim();
  if (!defIndex || !paintIndex) return null;

  const params = new URLSearchParams({
    def_index: defIndex,
    paint_index: paintIndex,
  });

  const range = getWearFloatRange(item);
  if (range) {
    params.set("min_float", range.min.toFixed(2));
    params.set("max_float", range.max.toFixed(2));
  } else {
    if (typeof item.min_float === "number") params.set("min_float", item.min_float.toFixed(2));
    if (typeof item.max_float === "number") params.set("max_float", item.max_float.toFixed(2));
  }

  if (item.stattrak) params.set("stattrak", "1");
  if (item.souvenir) params.set("souvenir", "1");

  return `https://csfloat.com/search?${params.toString()}`;
}

function getCsfloatBestUrl(item: CsgoApiItem | null, endpointKey?: string): string | null {
  if (!item) return null;

  const defIndex = item.def_index?.toString().trim();
  if (!defIndex) return getCsfloatQueryUrl(item);

  if (endpointKey === "stickers" || endpointKey === "patches" || endpointKey === "sticker_slabs") {
    return `https://csfloat.com/search?sticker_index=${defIndex}`;
  }

  if (endpointKey === "keychains") {
    return `https://csfloat.com/search?keychain_index=${defIndex}`;
  }

  if (endpointKey === "music_kits") {
    return `https://csfloat.com/search?music_kit_index=${defIndex}`;
  }

  if (endpointKey === "crates" || endpointKey === "agents" || endpointKey === "collectibles") {
    return `https://csfloat.com/search?def_index=${defIndex}`;
  }

  // skins — usa weapon_id como def_index + paint_index + floats
  return getCsfloatTechnicalUrl(item) ?? getCsfloatQueryUrl(item);
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
  const [skinFilter, setSkinFilter] = useState(ALL);
  const [wearFilter, setWearFilter] = useState(ALL);

  const isSkinEndpoint = selectedEndpoint === "skins_not_grouped";

  useEffect(() => {
    setOpenedItem(null);
    setSelectedWear("");
    setSkinClassFilter(ALL);
    setWeaponFilter(ALL);
    setRarityFilter(ALL);
    setSkinFilter(ALL);
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

  const skinNames = useMemo(
    () => Array.from(new Set(afterRarity.map((item) => item.baseName))).sort(),
    [afterRarity],
  );

  const afterSkin = useMemo(
    () => afterRarity.filter((item) => skinFilter === ALL ? true : item.baseName === skinFilter),
    [afterRarity, skinFilter],
  );

  const wears = useMemo(() => {
    const names = new Set<string>();
    for (const item of afterSkin) {
      for (const option of item.wearOptions) {
        names.add(option.label);
      }
    }
    return Array.from(names).sort((a, b) => getWearRank(a) - getWearRank(b));
  }, [afterRarity]);

  const itensFiltrados = useMemo(() => {
    const filtered = afterSkin.filter((item) =>
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
  const selectedItemMarketUrl = getSteamMarketUrl(selectedItem);
  const selectedItemCsfloatUrl = getCsfloatBestUrl(selectedItem, selectedEndpoint);

  function openSteamMarket(item: CsgoApiItem | null) {
    const url = getSteamMarketUrl(item);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openCsfloat(item: CsgoApiItem | null) {
    const url = getCsfloatBestUrl(item, selectedEndpoint);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-10 text-center">
          <h1 className="mb-2 text-4xl font-black uppercase tracking-tighter text-white">
            CS2 <span className="text-orange-500">Inventory</span>
          </h1>
          <p className="text-slate-400">Filtre skins e outros itens da <a href="https://github.com/ByMykel/CSGO-API" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300">CS:GO-API</a></p>
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
            <div className="mb-3 grid gap-2 text-xs font-semibold text-slate-300 sm:grid-cols-6">
              <p>Total busca: {baseBySearch.length}</p>
              <p>Após classe: {afterClass.length}</p>
              <p>Após arma: {afterWeapon.length}</p>
              <p>Após raridade: {afterRarity.length}</p>
              <p>Após skin: {afterSkin.length}</p>
              <p>Resultado final: {itensFiltrados.length}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <select
                value={skinClassFilter}
                onChange={(e) => {
                  setSkinClassFilter(e.target.value);
                  setWeaponFilter(ALL);
                  setRarityFilter(ALL);
                  setSkinFilter(ALL);
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
                  setSkinFilter(ALL);
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
                  setSkinFilter(ALL);
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
                value={skinFilter}
                onChange={(e) => {
                  setSkinFilter(e.target.value);
                  setWearFilter(ALL);
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                <option value={ALL}>Skin (todas)</option>
                {skinNames.map((skin) => (
                  <option key={skin} value={skin}>
                    {skin}
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
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-700 bg-emerald-950/40 px-4 py-3">
            <p className="text-emerald-300">
              Item selecionado: <span className="font-semibold">{selectedLabelText}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {!NO_CSFLOAT_ENDPOINTS.has(selectedEndpoint) && (
                <button
                  type="button"
                  className="rounded-lg border border-cyan-500 px-3 py-2 text-sm font-semibold text-cyan-300 hover:border-cyan-300"
                  disabled={!selectedItemCsfloatUrl}
                  onClick={() => openCsfloat(selectedItem)}
                >
                  Ver no CSFloat
                </button>
              )}
              {!NO_STEAM_ENDPOINTS.has(selectedEndpoint) && (
                <button
                  type="button"
                  className="rounded-lg border border-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-300 hover:border-emerald-300"
                  disabled={!selectedItemMarketUrl}
                  onClick={() => openSteamMarket(selectedItem)}
                >
                  Ver no Steam Market
                </button>
              )}
            </div>
          </div>
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

      <footer className="mt-16 border-t border-slate-800 py-8">
        <div className="mx-auto max-w-7xl px-4 md:px-10">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            <div className="text-center sm:text-left">
              <p className="text-xs text-slate-500">
                Dados fornecidos por{" "}
                <a
                  href="https://github.com/ByMykel"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 underline-offset-2 hover:text-orange-400 hover:underline"
                >
                  ByMykel/CSGO-API
                </a>
              </p>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500">Feito por <span className="text-slate-400">Pedro Franco</span></span>
              <a
                href="https://github.com/PedroFerreiraFranco"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 transition-colors hover:text-white"
                title="GitHub"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z"/>
                </svg>
              </a>
              <a
                href="https://www.linkedin.com/in/pedro-ferreira-franco/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 transition-colors hover:text-blue-400"
                title="LinkedIn"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
              <a
                href="https://pedroffranco.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 transition-colors hover:text-orange-400"
                title="Site pessoal"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </a>
              <a
                href="https://www.instagram.com/pedrofranco_11/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 transition-colors hover:text-pink-400"
                title="Instagram"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>

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
                  {!NO_CSFLOAT_ENDPOINTS.has(selectedEndpoint) && (
                    <button
                      type="button"
                      className="rounded-lg border border-cyan-500 px-4 py-2 text-sm font-semibold text-cyan-300 hover:border-cyan-300"
                      disabled={!activeWearItem}
                      onClick={() => openCsfloat(activeWearItem)}
                    >
                      CSFloat
                    </button>
                  )}
                  {!NO_STEAM_ENDPOINTS.has(selectedEndpoint) && (
                    <button
                      type="button"
                      className="rounded-lg border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-300 hover:border-emerald-300"
                      disabled={!activeWearItem}
                      onClick={() => openSteamMarket(activeWearItem)}
                    >
                      Steam Market
                    </button>
                  )}
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
