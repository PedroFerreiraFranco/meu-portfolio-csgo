export type ItemRarity = {
  id?: string;
  name: string;
  color: string;
};

export type ItemWear = {
  id: string;
  name: string;
};

export type CsgoApiItem = {
  id: string;
  name: string;
  skin_id?: string;
  def_index?: string | number;
  paint_index?: string | number;
  min_float?: number;
  max_float?: number;
  stattrak?: boolean;
  souvenir?: boolean;
  image?: string;
  rarity?: ItemRarity;
  wear?: ItemWear;
  wears?: ItemWear[];
  weapon?: { id?: string; weapon_id?: number; name: string };
  category?: { id?: string; name: string };
  collections?: Array<{ id: string; name: string; image?: string }>;
  description?: string;
  market_hash_name?: string;
};
