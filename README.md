# CS:GO Inventory (Next.js + TypeScript)

Projeto de portfólio/estudo consumindo a CSGO-API com:

- **Next.js (App Router)**
- **TypeScript**
- **Tailwind CSS**
- Busca dinâmica no cliente
- Cards com estilos baseados em `skin.rarity.color`

## Rodando localmente

```bash
npm install
npm run dev
```

## Estrutura principal

- `src/app/page.tsx`: fetch dos dados no servidor (Server Component)
- `src/components/skin-search-grid.tsx`: busca em tempo real no cliente (Client Component)
- `src/lib/types.ts`: tipagens da skin
