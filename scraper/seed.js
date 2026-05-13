/**
 * Seed Supabase with the baseline scan from 2026-04-20 (themommydictionary).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node seed.js
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Inline seed data ─────────────────────────────────────────────────────────
// Source: scans.json snapshot taken 2026-04-20
const SCAN_DATE = '2026-04-20';
const BASE_DATE = new Date('2026-04-20T00:00:00.000Z');

const POPULAR = [
  { rank: 1,  brand: 'ME+EM',                             name: 'Fit + Flare Maxi Dress',                                    price: '$250',    category: 'Dresses' },
  { rank: 2,  brand: 'Alo',                               name: 'Take It Easy Long Sleeve Henley Pullover Sweatshirt',       price: null,      category: 'Sweatshirts & Hoodies' },
  { rank: 3,  brand: 'KHAITE',                            name: 'Khaite x Oliver Peoples 1984c Flat-Top Sunglasses',         price: '$405',    category: 'Sunglasses' },
  { rank: 4,  brand: 'SIMONMILLER',                       name: 'Za Za Fringe Knit Midi Skirt',                              price: '$325',    category: 'Skirts' },
  { rank: 5,  brand: 'TT Studios',                        name: 'Jan Skirt',                                                 price: '$268',    category: 'Skirts' },
  { rank: 6,  brand: 'RIXO',                              name: 'Loralyn Silk Midi Dress',                                   price: '$475',    category: 'Dresses' },
  { rank: 7,  brand: 'ME+EM',                             name: 'Maxi Dress Belt',                                           price: '$250',    category: 'Dresses' },
  { rank: 8,  brand: 'APL - Athletic Propulsion Labs',    name: 'Veil Sneaker',                                              price: '$350',    category: 'Sneakers' },
  { rank: 9,  brand: 'APL - Athletic Propulsion Labs',    name: 'TechLoom Zipline Sneakers',                                 price: '$350',    category: 'Sneakers' },
  { rank: 10, brand: 'Chiara Boni La Petite Robe',        name: 'Liyan Belted Polka Dot Maxi Dress',                         price: '$1400',   category: 'Dresses' },
  { rank: 11, brand: 'RIXO',                              name: 'Meg Midi Dress',                                            price: '$275',    category: 'Dresses' },
  { rank: 12, brand: 'Fabletics',                         name: 'Seamless Scrunch High Waisted Leggings',                    price: '$18.99',  category: 'Leggings' },
  { rank: 13, brand: 'BY MALENE BIRGER',                  name: 'Aubrey Skirt',                                              price: '$281',    category: 'Skirts' },
  { rank: 14, brand: 'Varley',                            name: 'Hawley Half-Zip Sweatshirt',                                price: '$148',    category: 'Sweatshirts & Hoodies' },
  { rank: 15, brand: 'WeWoreWhat',                        name: 'Boxy Cinched T-Shirt Bodysuit',                             price: '$78',     category: 'Bodysuits' },
  { rank: 16, brand: 'Birkenstock',                       name: 'Sydney Luxe Birko-Flor Sandal',                             price: '$133.95', category: 'Sandals' },
  { rank: 17, brand: 'RIXO',                              name: 'Jess Crepe Midi Dress',                                     price: '$355',    category: 'Dresses' },
  { rank: 18, brand: 'SIMKHAI',                           name: 'Jazz Embellished A-Line Midi Dress',                        price: '$695',    category: 'Dresses' },
  { rank: 19, brand: 'SIMKHAI',                           name: 'Ovie Knit Cotton Midi Skirt',                               price: '$395',    category: 'Skirts' },
  { rank: 20, brand: 'ME+EM',                             name: 'Fit + Flare Silk Maxi Dress',                               price: '$695',    category: 'Dresses' },
  { rank: 21, brand: 'Splits59',                          name: 'Andie Oversized Fleece Sweatshirt',                         price: '$124',    category: 'Sweatshirts & Hoodies' },
  { rank: 22, brand: 'Merlette',                          name: 'Ines Dress',                                                price: '$495',    category: 'Dresses' },
  { rank: 23, brand: 'Varley',                            name: 'Hartwell Button-Through Sweater',                           price: '$178',    category: 'Sweaters' },
  { rank: 24, brand: 'Ruggable',                          name: 'Jonathan Adler Easthampton Monogram Doormat',               price: '$159',    category: 'Doormats' },
  { rank: 25, brand: 'RIXO',                              name: 'Meera Chiffon Gown',                                        price: '$525',    category: 'Dresses' },
  { rank: 26, brand: 'MANGO',                             name: 'Pleated Midi Skirt with Asymmetrical Hem',                  price: '$139.99', category: 'Skirts' },
  { rank: 27, brand: 'Varley',                            name: 'Reena Button Front Sweatshirt',                             price: '$168',    category: 'Sweatshirts & Hoodies' },
  { rank: 28, brand: 'Loeffler Randall',                  name: 'Leonie Crystal Mesh Ballerina Flats',                       price: '$275',    category: 'Flats' },
  { rank: 29, brand: 'J.Crew',                            name: 'Pleated Skirt in Cotton Poplin',                            price: '$124.50', category: 'Skirts' },
  { rank: 30, brand: 'TKEES',                             name: 'Reese Flats',                                               price: '$175',    category: 'Flats' },
  { rank: 31, brand: 'Merlette',                          name: 'Shore Maxi Dress',                                          price: '$495',    category: 'Dresses' },
  { rank: 32, brand: 'FARM Rio',                          name: 'Usiacuri Multicolor Richelieu Maxi Dress',                  price: '$448',    category: 'Dresses' },
  { rank: 33, brand: "Lands' End",                        name: "Women's SunShade UPF 50 Long Sleeve Relaxed Rash Guard Print", price: '$54.95', category: 'Swimwear' },
  { rank: 34, brand: 'Steve Madden',                      name: 'Divy Leather Flat',                                         price: '$109.95', category: 'Flats' },
  { rank: 35, brand: 'Zadig&Voltaire',                    name: 'Rhani Silk Dress',                                          price: '$848',    category: 'Dresses' },
  { rank: 36, brand: 'Downy',                             name: 'Unstopables Unlimited Collection N.26 Laundry Scent Booster', price: '$15.99', category: 'Detergents' },
];

const LATEST_RAW = [
  { posted_relative: '2 hours ago',  brand: 'JLUXLABEL',     name: 'Core Standard Blazer',                                 price: '$145',  category: 'Blazers' },
  { posted_relative: '16 hours ago', brand: 'BERNADETTE',    name: 'Ezra Floral-Print Ruched 3/4-Sleeve Maxi Dress',      price: '$930',  category: 'Dresses' },
  { posted_relative: '16 hours ago', brand: 'Self-Portrait', name: 'Boucle Polka Dot Midi Dress',                         price: '$460',  category: 'Dresses' },
  { posted_relative: '16 hours ago', brand: 'Self-Portrait', name: 'Satin-Lace Pleated Midi Dress',                       price: '$695',  category: 'Dresses' },
  { posted_relative: '16 hours ago', brand: 'Deme by Gabriella', name: 'The Ivanna Dress',                                price: null,    category: 'Dresses' },
  { posted_relative: '16 hours ago', brand: 'SIMKHAI',       name: 'Octavia Jacquard Strapless Gown',                     price: '$845',  category: 'Dresses' },
  { posted_relative: '21 hours ago', brand: 'JULIETTA',      name: 'Ponza Earrring',                                      price: '$275',  category: 'Earrings' },
  { posted_relative: '22 hours ago', brand: 'Nike',          name: "Giannis Immortality 4 Little Kids' Shoes",            price: '$67',   category: 'Baby & Kids Shoes' },
  { posted_relative: 'yesterday',    brand: 'American Eagle Outfitters', name: 'Mid Rise Tiered Maxi Skirt',             price: '$69.95', category: 'Skirts' },
  { posted_relative: 'yesterday',    brand: 'AE',            name: 'Windbreaker Jacket',                                  price: '$84.95', category: 'Jackets' },
  { posted_relative: 'yesterday',    brand: 'American Eagle Outfitters', name: 'Mid-Rise Lace Maxi Skirt',              price: '$69.95', category: 'Skirts' },
  { posted_relative: 'yesterday',    brand: 'AE',            name: 'Low Rise Midi Skirt',                                 price: '$59.95', category: 'Skirts' },
];

function parseRelativeDate(str, base) {
  const s = str.toLowerCase().trim();
  if (s === 'yesterday') {
    const d = new Date(base);
    d.setDate(d.getDate() - 1);
    return d;
  }
  const m = s.match(/^(\d+)\s+(hour|day|week|month)s?\s+ago$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const d = new Date(base);
  switch (unit) {
    case 'hour':  d.setHours(d.getHours() - n); break;
    case 'day':   d.setDate(d.getDate() - n); break;
    case 'week':  d.setDate(d.getDate() - n * 7); break;
    case 'month': d.setMonth(d.getMonth() - n); break;
  }
  return d;
}

async function seed() {
  // Build rank lookup
  const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const rankMap = new Map();
  for (const p of POPULAR) {
    rankMap.set(`${normalize(p.brand)}|${normalize(p.name)}`, p.rank);
  }

  // Build rows from latest
  const latestRows = LATEST_RAW.map(item => {
    const posted_at = parseRelativeDate(item.posted_relative, BASE_DATE);
    const rank = rankMap.get(`${normalize(item.brand)}|${normalize(item.name)}`) ?? null;
    return {
      creator_username: 'themommydictionary',
      scan_date:        SCAN_DATE,
      product_url:      null,
      product_name:     item.name,
      brand:            item.brand,
      category:         item.category,
      price:            item.price,
      posted_at:        posted_at?.toISOString() || null,
      popular_rank:     rank,
    };
  });

  // Also insert popular items that didn't appear in latest (so we have rank context)
  const popularRows = POPULAR.map(p => ({
    creator_username: 'themommydictionary',
    scan_date:        SCAN_DATE,
    product_url:      null,
    product_name:     p.name,
    brand:            p.brand,
    category:         p.category,
    price:            p.price,
    posted_at:        null,  // unknown post date for items only in popular
    popular_rank:     p.rank,
  }));

  // Merge: latest rows take precedence (they may have posted_at)
  const allByKey = new Map();
  for (const r of popularRows) {
    allByKey.set(`${r.product_name}|${r.brand}`, r);
  }
  for (const r of latestRows) {
    allByKey.set(`${r.product_name}|${r.brand}`, r);
  }

  const rows = Array.from(allByKey.values());

  console.log(`Seeding ${rows.length} rows for themommydictionary (${SCAN_DATE})…`);
  const { error } = await supabase
    .from('scans')
    .upsert(rows, { onConflict: 'creator_username,scan_date,product_name,brand' });

  if (error) {
    console.error('Seed error:', error.message);
    process.exit(1);
  }
  console.log('Seed complete.');
}

seed();
