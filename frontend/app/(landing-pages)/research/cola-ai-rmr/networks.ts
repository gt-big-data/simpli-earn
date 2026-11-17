// Curated paths from public/research-data/cola-ai-basket-sources.csv.
// Coordinates keep the intermediate entities visible beside their listed parents.
type Company = [ticker: string, name: string, x: number, y: number, bridge?: boolean];
type Relationship = [from: string, verb: string, to: string];
export type Network = { root: string; nodes: Company[]; edges: Relationship[] };

export const colaNetwork: Network = {
  root: "KO",
  nodes: [
    ["KO", "The Coca-Cola Company", 370, 179],
    ["COKE", "Coca-Cola Consolidated", 198, 105],
    ["WMT", "Walmart", 69, 42], ["KR", "Kroger", 67, 103],
    ["KDP", "Keurig Dr Pepper", 69, 164], ["MNST", "Monster Beverage", 210, 182],
    ["MCD", "McDonald’s", 296, 46], ["CCEP", "Coca-Cola Europacific Partners", 395, 37],
    ["AC.MX", "Arca Continental", 493, 60], ["CCH.L", "Coca-Cola HBC", 505, 114],
    ["AKO-B", "Embotelladora Andina", 529, 173], ["Linde Chile", "Linde Gas Chile", 633, 173, true],
    ["LIN", "Linde", 735, 173], ["KOF", "Coca-Cola FEMSA", 515, 244],
    ["ALMEX", "Almidones Mexicanos", 627, 251, true], ["ADM", "Archer-Daniels-Midland", 735, 253],
    ["CCK", "Crown Holdings", 424, 309], ["AMBP", "Ardagh Metal Packaging", 317, 309],
    ["CCBSS", "Coca-Cola Bottlers’ Sales & Services", 207, 257, true],
    ["BALL", "Ball Corporation", 67, 288],
  ],
  edges: [
    ["KO", "supplies concentrate to", "COKE"], ["COKE", "sells beverages to", "WMT"],
    ["COKE", "sells beverages to", "KR"], ["KDP", "licenses beverage brands to", "COKE"],
    ["KO", "holds a stake in and partners on distribution with", "MNST"],
    ["KO", "supplies fountain beverages to", "MCD"], ["KO", "franchises bottling to", "CCEP"],
    ["KO", "franchises bottling to", "AC.MX"], ["KO", "franchises bottling to", "CCH.L"],
    ["KO", "franchises bottling to", "AKO-B"], ["LIN", "owns", "Linde Chile"],
    ["Linde Chile", "supplies carbon dioxide to", "AKO-B"], ["KO", "franchises bottling to", "KOF"],
    ["ADM", "owns half of", "ALMEX"], ["ALMEX", "supplies sweeteners to", "KOF"],
    ["CCK", "supplies cans to the bottling system of", "KO"],
    ["AMBP", "reports can sales to the bottling system of", "KO"],
    ["CCBSS", "coordinates procurement for the bottling system of", "KO"],
    ["BALL", "supplies packaging through", "CCBSS"],
  ],
};

export const aiNetwork: Network = {
  root: "NVDA",
  nodes: [
    ["NVDA", "NVIDIA", 349, 176], ["TSM", "Taiwan Semiconductor Manufacturing Company", 484, 109],
    ["AMD", "Advanced Micro Devices", 351, 45], ["MU", "Micron Technology", 505, 250],
    ["ASML", "ASML Holding", 641, 148], ["AMAT", "Applied Materials", 715, 185],
    ["LRCX", "Lam Research", 639, 225], ["KLAC", "KLA Corporation", 632, 51],
    ["MRVL", "Marvell Technology", 209, 78], ["VRT", "Vertiv", 278, 275],
    ["MSFT", "Microsoft", 206, 176, true], ["ANET", "Arista Networks", 68, 176],
  ],
  edges: [
    ["TSM", "manufactures chips for", "NVDA"], ["AMD", "competes in accelerators with", "NVDA"],
    ["TSM", "manufactures chips for", "AMD"], ["MU", "supplies memory for platforms from", "NVDA"],
    ["ASML", "supplies lithography equipment to", "TSM"], ["ASML", "supplies lithography equipment to", "MU"],
    ["AMAT", "supplies fabrication equipment to", "TSM"], ["AMAT", "received a supplier award from", "MU"],
    ["LRCX", "supplies fabrication equipment to", "TSM"], ["LRCX", "supports fabrication processes at", "MU"],
    ["KLAC", "supplies process-control equipment to", "TSM"],
    ["MRVL", "competes in custom silicon and participates in NVLink Fusion with", "NVDA"],
    ["NVDA", "supplies AI infrastructure to", "MSFT"], ["ANET", "supplies networking to", "MSFT"],
    ["VRT", "collaborates on power and cooling with", "NVDA"],
  ],
};
