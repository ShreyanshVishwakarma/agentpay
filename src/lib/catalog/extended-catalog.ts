export type ExtendedCatalogItem = {
  sku: string;
  name: string;
  description: string;
  pricePaise: number;
  stock: number;
};

export const EXTENDED_CATALOG: ExtendedCatalogItem[] = [
  // ── Electronics – Smartphones ──
  { sku: "electronics-iphone15-128", name: "Apple iPhone 15 (128GB) — Midnight", description: "A17 Pro chip, 48MP camera, 6.1\" Super Retina XDR display. 1-year Apple warranty.", pricePaise: 7090000, stock: 12 },
  { sku: "electronics-iphone15-pro-256", name: "Apple iPhone 15 Pro (256GB) — Natural Titanium", description: "Titanium design, Action button, 120Hz ProMotion. 1-year warranty.", pricePaise: 13490000, stock: 8 },
  { sku: "electronics-galaxy-s24-256", name: "Samsung Galaxy S24 (256GB) — Onyx Black", description: "Snapdragon 8 Gen 3, 50MP triple camera, Galaxy AI features.", pricePaise: 7999900, stock: 15 },
  { sku: "electronics-pixel-8-128", name: "Google Pixel 8 (128GB) — Hazel", description: "Tensor G3, 7 years updates, Magic Eraser & Best Take.", pricePaise: 7599900, stock: 10 },
  { sku: "electronics-oneplus-12-256", name: "OnePlus 12 (256GB) — Flowy Emerald", description: "Snapdragon 8 Gen 3, 100W SuperVOOC, Hasselblad cameras.", pricePaise: 6499900, stock: 18 },
  { sku: "electronics-nothing-phone2-256", name: "Nothing Phone (2) 256GB — White", description: "Glyph Interface, Snapdragon 8+ Gen 1, 50MP dual camera.", pricePaise: 4499900, stock: 14 },
  { sku: "electronics-redmi-note13-pro-256", name: "Redmi Note 13 Pro+ 256GB — Midnight Black", description: "200MP camera, 120W HyperCharge, IP68.", pricePaise: 3199900, stock: 25 },
  { sku: "electronics-poco-f5-256", name: "POCO F5 256GB — Carbon Black", description: "Snapdragon 7+ Gen 2, 120Hz AMOLED, 67W turbo charging.", pricePaise: 2999900, stock: 22 },
  { sku: "electronics-moto-edge40-256", name: "Motorola Edge 40 256GB — Viva Magenta", description: "Dimensity 8020, 144Hz pOLED, IP68 water resistant.", pricePaise: 2999900, stock: 16 },

  // ── Electronics – Laptops & Tablets ──
  { sku: "electronics-macbook-air-m2-256", name: "Apple MacBook Air M2 (256GB) — Starlight", description: "13.6\" Liquid Retina, 8-core CPU, 18-hour battery. macOS.", pricePaise: 11490000, stock: 7 },
  { sku: "electronics-dell-xps13-i7-512", name: "Dell XPS 13 (i7/16GB/512GB) — Platinum", description: "13.4\" InfinityEdge, Intel Core i7-1360P, Windows 11.", pricePaise: 11999000, stock: 5 },
  { sku: "electronics-hp-pavilion-15-512", name: "HP Pavilion 15 (Ryzen 7/16GB/512GB)", description: "15.6\" FHD, backlit keyboard, B&O audio.", pricePaise: 6899000, stock: 9 },
  { sku: "electronics-lenovo-ideapad-slim5-512", name: "Lenovo IdeaPad Slim 5 (16GB/512GB)", description: "14\" 2.8K OLED, Ryzen 7 7840U, 14-hour battery.", pricePaise: 7299000, stock: 11 },
  { sku: "electronics-asus-vivobook-15-512", name: "ASUS VivoBook 15 (i5/16GB/512GB)", description: "15.6\" FHD, Intel i5-1335U, fast charging.", pricePaise: 5499000, stock: 13 },
  { sku: "electronics-ipad-10-64-wifi", name: "Apple iPad 10th Gen 64GB Wi-Fi — Blue", description: "10.9\" Liquid Retina, A14 Bionic, Touch ID.", pricePaise: 3990000, stock: 10 },
  { sku: "electronics-samsung-tab-s9-128", name: "Samsung Galaxy Tab S9 128GB — Graphite", description: "11\" Dynamic AMOLED 2X, S Pen included, IP68.", pricePaise: 8599900, stock: 6 },
  { sku: "electronics-lenovo-tab-m11-128", name: "Lenovo Tab M11 128GB — Luna Grey", description: "11\" display, quad speakers, 7040mAh battery.", pricePaise: 1799900, stock: 18 },

  // ── Electronics – Audio ──
  { sku: "electronics-sony-wh1000xm5", name: "Sony WH-1000XM5 Wireless Headphones — Black", description: "Industry-leading noise cancelling, 30-hour battery, multipoint.", pricePaise: 2999000, stock: 14 },
  { sku: "electronics-airpods-pro-2", name: "Apple AirPods Pro (2nd Gen)", description: "Active noise cancellation, Adaptive Transparency, MagSafe case.", pricePaise: 2690000, stock: 20 },
  { sku: "electronics-jbl-go3", name: "JBL Go 3 Portable Bluetooth Speaker — Blue", description: "IP67 waterproof, 5-hour playtime, clip design.", pricePaise: 399900, stock: 30 },
  { sku: "electronics-boat-rockerz-255-pro", name: "boAt Rockerz 255 Pro+ Neckband — Navy", description: "40-hour playback, ASAP charge, IPX7.", pricePaise: 149900, stock: 40 },
  { sku: "electronics-jbl-tune-235-nc", name: "JBL Tune 235NC TWS Earbuds — Black", description: "Active noise cancelling, 40-hour battery, 4 mics.", pricePaise: 499900, stock: 28 },
  { sku: "electronics-sony-wf-c500", name: "Sony WF-C500 Truly Wireless Earbuds — White", description: "Compact design, 20-hour battery, DSEE.", pricePaise: 599900, stock: 22 },
  { sku: "electronics-samsung-buds2-pro", name: "Samsung Galaxy Buds2 Pro — Bora Purple", description: "Intelligent ANC, 360 Audio, IPX7.", pricePaise: 1799900, stock: 15 },

  // ── Electronics – Peripherals & Accessories ──
  { sku: "electronics-logitech-mx-keys", name: "Logitech MX Keys Wireless Keyboard — Graphite", description: "Smart illumination, multi-device, USB-C rechargeable.", pricePaise: 1299500, stock: 18 },
  { sku: "electronics-logitech-mx-master3s", name: "Logitech MX Master 3S Mouse — Graphite", description: "8K DPI, MagSpeed scroll, quiet clicks.", pricePaise: 1099500, stock: 22 },
  { sku: "electronics-keychron-k2-v2", name: "Keychron K2 Wireless Mechanical Keyboard — Grey", description: "75% layout, hot-swappable, Bluetooth 5.1.", pricePaise: 899500, stock: 12 },
  { sku: "electronics-dell-27-4k-monitor", name: "Dell 27\" 4K UHD Monitor (S2722QC) — Silver", description: "IPS, USB-C 65W, HDR, built-in speakers.", pricePaise: 2899900, stock: 8 },
  { sku: "electronics-sandisk-1tb-ssd", name: "SanDisk Extreme Portable SSD 1TB — Black", description: "1050MB/s, IP55, 5-year warranty.", pricePaise: 899900, stock: 20 },
  { sku: "electronics-anker-20000-powerbank", name: "Anker PowerCore 20000mAh Power Bank — Black", description: "PowerIQ, 2x USB-A + USB-C, 18W fast charge.", pricePaise: 399900, stock: 35 },
  { sku: "electronics-boat-65w-charger", name: "boAt 65W GaN Charger — White", description: "3 ports (2x USB-C + USB-A), foldable pins.", pricePaise: 249900, stock: 40 },
  { sku: "electronics-beningo-webcam-1080p", name: "Logitech C920 HD Pro Webcam — Black", description: "1080p, stereo mics, autofocus.", pricePaise: 699900, stock: 14 },
  { sku: "electronics-tp-link-archer-ax73", name: "TP-Link Archer AX73 Wi-Fi 6 Router — Black", description: "5400 Mbps, 6 antennas, HomeShield.", pricePaise: 899900, stock: 10 },

  // ── Personal Care – Toothbrush to Grooming ──
  { sku: "personal-colgate-charcoal-soft", name: "Colgate Charcoal Clean Toothbrush — Soft (Pack of 4)", description: "Charcoal-infused bristles, tongue cleaner.", pricePaise: 19900, stock: 80 },
  { sku: "personal-oralb-pro1000-electric", name: "Oral-B Pro 1000 Electric Toothbrush — White", description: "3D cleaning, pressure sensor, 2-week battery.", pricePaise: 349900, stock: 22 },
  { sku: "personal-colgate-total-paste-150g", name: "Colgate Total Whole Mouth Health Toothpaste 150g", description: "12-hour antibacterial protection.", pricePaise: 18500, stock: 60 },
  { sku: "personal-sensodyne-rapid-80g", name: "Sensodyne Rapid Relief Toothpaste 80g", description: "Clinically proven sensitivity relief.", pricePaise: 16500, stock: 55 },
  { sku: "personal-listering-coolmint-500ml", name: "Listerine Cool Mint Mouthwash 500ml", description: "Kills 99.9% germs, 24-hour fresh breath.", pricePaise: 28500, stock: 40 },
  { sku: "personal-philips-bt3231-trimmer", name: "Philips BT3231 Beard Trimmer — Black", description: "20 length settings, 90-min runtime, self-sharpening blades.", pricePaise: 199900, stock: 18 },
  { sku: "personal-gillette-mach3-cartridge-8", name: "Gillette Mach3 Cartridges (Pack of 8)", description: "3 blades, pivoting head, long-lasting.", pricePaise: 79900, stock: 35 },
  { sku: "personal-dove-men-facewash-100g", name: "Dove Men+Care Face Wash 100g", description: "Deep clean with hydration.",
    pricePaise: 24900, stock: 45 },
  { sku: "personal-nivea-soft-200ml", name: "Nivea Soft Light Moisturizer 200ml", description: "Jojoba oil & Vitamin E, 48-hour moisture.", pricePaise: 39900, stock: 30 },
  { sku: "personal-head-shoulders-650ml", name: "Head & Shoulders Smooth & Silky Shampoo 650ml", description: "Anti-dandruff with argan oil.", pricePaise: 52500, stock: 28 },
  { sku: "personal-deploy-electric-toothbrush-kids", name: "Oral-B Kids Electric Toothbrush — Frozen", description: "Gentle cleaning, fun timer, 2 brush heads.", pricePaise: 249900, stock: 16 },

  // ── Home & Kitchen ──
  { sku: "home-prestige-pressure-cooker-5l", name: "Prestige Nakshatra Plus Pressure Cooker 5L — Silver", description: "Hard anodized, induction compatible.", pricePaise: 349900, stock: 14 },
  { sku: "home-bajaj-mixer-grinder-750w", name: "Bajaj GX-8 Mixer Grinder 750W — White", description: "3 jars, Tetra-flow technology.", pricePaise: 429900, stock: 10 },
  { sku: "home-milton-thermos-1l", name: "Milton Thermosteel Flip Lid Bottle 1L — Steel", description: "24-hour hot & cold, rust-proof.", pricePaise: 109900, stock: 40 },
  { sku: "home-borosil-glass-bottle-1l", name: "Borosil Glass Bottle 1L — Transparent", description: "Borosilicate glass, leak-proof lid.", pricePaise: 59900, stock: 35 },
  { sku: "home-ikea-kallax-shelf-4x2", name: "IKEA KALLAX Shelf Unit 4x2 — White", description: "77x147 cm, standing or lying.", pricePaise: 999900, stock: 6 },
  { sku: "home-philips-airfryer-4l", name: "Philips Digital Air Fryer 4.1L — Black", description: "Rapid Air tech, 90% less fat, touchscreen.", pricePaise: 899900, stock: 7 },
  { sku: "home-prestige-induction-cooktop", name: "Prestige PIC 20 Induction Cooktop — Black", description: "1600W, push-button, anti-magnetic wall.", pricePaise: 299900, stock: 12 },
  { sku: "home-wonderchef-knife-set-3", name: "Wonderchef Knife Set (3 pcs) — Black/Red", description: "Stainless steel, ergonomic handles.", pricePaise: 149900, stock: 20 },
  { sku: "home-solimo-bedsheet-king", name: "AmazonBasics Microfiber King Bedsheet — Grey", description: "144 TC, with 2 pillow covers.", pricePaise: 129900, stock: 25 },
  { sku: "home-cello-storage-18l", name: "Cello Novelty Big Storage Container 18L — Blue", description: "Airtight, stackable, BPA free.", pricePaise: 59900, stock: 30 },

  // ── Fashion ──
  { sku: "fashion-levi-501-jeans-32", name: "Levi's 501 Original Jeans (W32) — Stonewash", description: "Straight fit, button fly, 100% cotton.", pricePaise: 499900, stock: 18 },
  { sku: "fashion-nike-air-zoom-pegasus-40", name: "Nike Air Zoom Pegasus 40 — Black/White", description: "Zoom Air cushioning, breathable mesh.", pricePaise: 1099500, stock: 12 },
  { sku: "fashion-adidas-essentials-hoodie-l", name: "Adidas Essentials Fleece Hoodie (L) — Black", description: "Cotton blend, kangaroo pocket.", pricePaise: 399900, stock: 20 },
  { sku: "fashion-puma-tshirt-pack-3", name: "Puma Crew T-Shirt Pack of 3 — Assorted", description: "100% cotton, regular fit.", pricePaise: 199900, stock: 30 },
  { sku: "fashion-wildcraft-backpack-30l", name: "Wildcraft 30L Backpack — Navy", description: "Water resistant, laptop sleeve.", pricePaise: 249900, stock: 22 },
  { sku: "fashion-fastrack-watch-38003pp04", name: "Fastrack Reflex 3.0 Smartwatch — Black", description: "1.3\" display, SpO2, 10-day battery.", pricePaise: 299900, stock: 15 },
  { sku: "fashion-rayban-aviator-3025", name: "Ray-Ban Aviator Classic RB3025 — Gold/Green", description: "58mm, G-15 lens, metal frame.", pricePaise: 899900, stock: 8 },
  { sku: "fashion-bata-formal-shoes-8", name: "Bata Formal Leather Shoes (Size 8) — Brown", description: "Genuine leather, cushioned insole.", pricePaise: 299900, stock: 14 },
  { sku: "fashion-allen-solly-shirt-40", name: "Allen Solly Slim Fit Shirt (40) — Light Blue", description: "Cotton, easy iron.", pricePaise: 199900, stock: 18 },
  { sku: "fashion-skybags-trolley-55cm", name: "Skybags 55cm Cabin Trolley — Red", description: "Hard shell, TSA lock, 4 wheels.", pricePaise: 549900, stock: 9 },

  // ── Grocery & Food (packaged) ──
  { sku: "grocery-aashirvaad-atta-10kg", name: "Aashirvaad Whole Wheat Atta 10kg", description: "100% MP wheat, chakki ground.", pricePaise: 59900, stock: 50 },
  { sku: "grocery-tata-tea-gold-1kg", name: "Tata Tea Gold 1kg — Assam Blend", description: "Rich taste, 15% long leaves.", pricePaise: 54500, stock: 45 },
  { sku: "grocery-nescafe-classic-200g", name: "Nescafé Classic Coffee 200g Jar", description: "100% pure instant coffee.", pricePaise: 64500, stock: 40 },
  { sku: "grocery-fortune-sunflower-5l", name: "Fortune Sunlite Sunflower Oil 5L Jar", description: "Light & healthy cooking oil.", pricePaise: 74900, stock: 30 },
  { sku: "grocery-maggi-12-pack", name: "Maggi 2-Minute Noodles (12 x 70g) — Masala", description: "Family pack, easy to cook.", pricePaise: 16800, stock: 60 },
  { sku: "grocery-britannia-goodday-600g", name: "Britannia Good Day Cashew Cookies 600g", description: "Crunchy cashew biscuits.", pricePaise: 14000, stock: 55 },
  { sku: "grocery-amul-butter-500g", name: "Amul Butter 500g — Pasteurised", description: "Rich taste, pure milk butter.", pricePaise: 28500, stock: 35 },
  { sku: "grocery-daawat-basmati-5kg", name: "Daawat Rozana Basmati Rice 5kg", description: "Aged basmati, extra long grains.", pricePaise: 69900, stock: 28 },
  { sku: "grocery-catch-masala-kit-200g", name: "Catch Kitchen King Masala 200g", description: "Blended spices, sealed freshness.", pricePaise: 9500, stock: 70 },
  { sku: "grocery-paperboat-aam-panna-1l", name: "Paper Boat Aam Panna 1L — Pack of 2", description: "Traditional raw mango drink.", pricePaise: 19800, stock: 40 },

  // ── Sports & Fitness ──
  { sku: "sports-decathlon-domyos-mat-8mm", name: "Domyos Yoga Mat 8mm — Grey", description: "Non-slip, carry strap, 180x60 cm.", pricePaise: 149900, stock: 22 },
  { sku: "sports-victor-badminton-racket", name: "Li-Ning G-Force Badminton Racket — Blue", description: "Carbon graphite, strung, cover included.", pricePaise: 249900, stock: 14 },
  { sku: "sports-cosco-football-size5", name: "Cosco Storm Football (Size 5) — White/Blue", description: "Hand-stitched, rubber bladder.", pricePaise: 89900, stock: 30 },
  { sku: "sports-boldfit-skipping-rope", name: "Boldfit Skipping Rope — Black/Red", description: "Adjustable, ball-bearing, steel wire.", pricePaise: 49900, stock: 35 },
  { sku: "sports-cockatoo-dumbbell-10kg-pair", name: "Cockatoo Hex Dumbbells 10kg Pair — Black", description: "Rubber coated, solid cast iron.", pricePaise: 299900, stock: 10 },
  { sku: "sports-nivia-volleyball", name: "Nivia Spikester Volleyball — Yellow/Blue", description: "18-panel, synthetic leather.", pricePaise: 89900, stock: 18 },
  { sku: "sports-strauss-gym-bag-30l", name: "Strauss Gym Bag 30L — Grey/Orange", description: "Shoe compartment, water resistant.", pricePaise: 129900, stock: 20 },

  // ── Books & Stationery ──
  { sku: "books-atomic-habits-paperback", name: "Atomic Habits by James Clear — Paperback", description: "Bestseller on habits & productivity, 320 pages.", pricePaise: 39900, stock: 45 },
  { sku: "books-psyschology-money-paperback", name: "The Psychology of Money by Morgan Housel — Paperback", description: "Timeless lessons on wealth & greed.", pricePaise: 29900, stock: 40 },
  { sku: "books-deep-work-paperback", name: "Deep Work by Cal Newport — Paperback", description: "Focused success in a distracted world.", pricePaise: 34900, stock: 35 },
  { sku: "stationery-classmate-notebook-6", name: "Classmate Pulse Notebook 200 Pages (Pack of 6) — Ruled", description: "Soft cover, 24x18 cm.", pricePaise: 49900, stock: 30 },
  { sku: "stationery-nataraj-pencil-10", name: "Nataraj 621 HB Pencils (Pack of 10) — Red/Black", description: "Bold writing, break resistant.", pricePaise: 6500, stock: 100 },
  { sku: "stationery-pilot-v7-pen-blue", name: "Pilot V7 Hi-Tecpoint Pen — Blue (Pack of 5)", description: "0.7mm, liquid ink, needle point.", pricePaise: 42500, stock: 28 },
  { sku: "stationery-casiosci-fx991ex", name: "Casio FX-991EX Scientific Calculator — Black", description: "552 functions, solar + battery.", pricePaise: 149900, stock: 15 },

  // ── Beauty & Grooming ──
  { sku: "beauty-lakme-cc-cream-30ml", name: "Lakmé 9to5 CC Cream 30ml — Beige", description: "SPF 30, conceals & brightens.", pricePaise: 29900, stock: 25 },
  { sku: "beauty-mamaearth-vitc-serum-30ml", name: "Mamaearth Vitamin C Serum 30ml", description: "20% Vitamin C, dermatologically tested.", pricePaise: 59900, stock: 20 },
  { sku: "beauty-maybelline-fitme-128", name: "Maybelline Fit Me Foundation 128 — Warm Nude", description: "Matte + poreless, 16-hour wear.", pricePaise: 54900, stock: 18 },
  { sku: "beauty-wildstone-deo-150ml", name: "Wild Stone Ultra Sensual Deodorant 150ml", description: "Long-lasting fragrance.", pricePaise: 19900, stock: 50 },
  { sku: "beauty-himalaya-face-wash-150ml", name: "Himalaya Purifying Neem Face Wash 150ml", description: "Neem & turmeric, prevents pimples.", pricePaise: 16500, stock: 45 },
  { sku: "beauty-biotiq-bio-papaya-scrub-75g", name: "Biotique Bio Papaya Scrub 75g", description: "Removes dead skin, unclogs pores.", pricePaise: 19900, stock: 35 },

  // ── A few intentionally limited / sold-out to demo policies ──
  { sku: "electronics-ps5-slim-1tb", name: "Sony PlayStation 5 Slim 1TB — White", description: "Disc edition, DualSense included, 4K gaming.", pricePaise: 5499000, stock: 0 },
  { sku: "electronics-dyson-v12-detect", name: "Dyson V12 Detect Slim Vacuum — Yellow/Nickel", description: "Laser detect, 60-min runtime.", pricePaise: 4890000, stock: 0 },
  { sku: "home-lego-creator-3in1", name: "LEGO Creator 3-in-1 Cozy House 808 pcs — Multicolor", description: "Build 3 models, ages 8+.", pricePaise: 699900, stock: 2 },
  { sku: "fashion-apple-watch-se-44mm", name: "Apple Watch SE 44mm GPS — Midnight", description: "Retina display, heart rate, water resistant.", pricePaise: 3290000, stock: 4 },
];
