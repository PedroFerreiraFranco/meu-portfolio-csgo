export const CSGO_ENDPOINTS = [
  {
    key: "all",
    label: "All Items",
    url: "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/all.json",
  },
  {
    key: "skins_not_grouped",
    label: "Skins",
    url: "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json",
  },
  {
    key: "keychains",
    label: "Keychains",
    url: "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/keychains.json",
  },
  {
    key: "crates",
    label: "Crates",
    url: "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json",
  },
  {
    key: "agents",
    label: "Agents",
    url: "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/agents.json",
  },
  {
    key: "music_kits",
    label: "Music Kits",
    url: "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/music_kits.json",
  },
  {
    key: "stickers",
    label: "Stickers",
    url: "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/stickers.json",
  },
  {
    key: "sticker_slabs",
    label: "Sticker Slabs",
    url: "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/sticker_slabs.json",
  },
  {
    key: "patches",
    label: "Patches",
    url: "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/patches.json",
  },
  {
    key: "graffiti",
    label: "Graffiti",
    url: "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/graffiti.json",
  },
  {
    key: "highlights",
    label: "Highlights",
    url: "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/highlights.json",
  },
  {
    key: "collections",
    label: "Collections",
    url: "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/collections.json",
  },
  {
    key: "keys",
    label: "Keys",
    url: "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/keys.json",
  },
  {
    key: "base_weapons",
    label: "Base Weapons",
    url: "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/base_weapons.json",
  },
  {
    key: "collectibles",
    label: "Collectibles",
    url: "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/collectibles.json",
  },
] as const;

export type EndpointKey = (typeof CSGO_ENDPOINTS)[number]["key"];
