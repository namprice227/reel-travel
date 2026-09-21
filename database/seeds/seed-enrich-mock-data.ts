import fs from "node:fs";
import path from "node:path";
import type { PlacePhoto, ProviderReview } from "@reel/contracts";

interface EnrichedData {
  category: string;
  summary: string;
  rating: number;
  ratingCount: number;
  phone: string;
  websiteUrl: string;
  providerUrl: string;
  photos: PlacePhoto[];
  reviews: ProviderReview[];
}

const VENUES: Record<string, EnrichedData> = {
  "Asakusa Lantern Temple": {
    category: "temple",
    summary: "Tokyo's oldest and most venerated Buddhist temple, famous for its colossal red Kaminarimon lantern, five-story pagoda, and vibrant Nakamise-dori market street.",
    rating: 4.7,
    ratingCount: 68420,
    phone: "+81 3-3842-0181",
    websiteUrl: "https://www.senso-ji.jp",
    providerUrl: "https://maps.google.com/?cid=1234567890",
    photos: [
      { ref: "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Taito Tourism / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Tokyo Travel / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Japan Guide / Unsplash" },
    ],
    reviews: [
      { authorName: "Elena Rostova", rating: 5, text: "Walking through Kaminarimon early in the morning before crowds arrive is pure magic. The incense smoke and towering pagoda are unforgettable.", relativeTime: "2 weeks ago", authorPhotoUrl: null, googleMapsUri: null },
      { authorName: "Kenji Sato", rating: 5, text: "The Nakamise shopping path leading up to the main hall has amazing freshly pressed ningyo-yaki cakes. A must-see Tokyo landmark.", relativeTime: "a month ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Sensō-ji": {
    category: "temple",
    summary: "Tokyo's oldest and most venerated Buddhist temple, famous for its colossal red Kaminarimon lantern, five-story pagoda, and vibrant Nakamise-dori market street.",
    rating: 4.7,
    ratingCount: 68420,
    phone: "+81 3-3842-0181",
    websiteUrl: "https://www.senso-ji.jp",
    providerUrl: "https://maps.google.com/?cid=1234567890",
    photos: [
      { ref: "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Taito Tourism / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Tokyo Travel / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Japan Guide / Unsplash" },
    ],
    reviews: [
      { authorName: "Elena Rostova", rating: 5, text: "Walking through Kaminarimon early in the morning before crowds arrive is pure magic. The incense smoke and towering pagoda are unforgettable.", relativeTime: "2 weeks ago", authorPhotoUrl: null, googleMapsUri: null },
      { authorName: "Kenji Sato", rating: 5, text: "The Nakamise shopping path leading up to the main hall has amazing freshly pressed ningyo-yaki cakes. A must-see Tokyo landmark.", relativeTime: "a month ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Sumida Sky Deck": {
    category: "viewpoint",
    summary: "Futuristic 634-meter broadcasting and observation tower offering breathtaking 360-degree panoramic vistas across the entire Greater Tokyo skyline and Mount Fuji.",
    rating: 4.6,
    ratingCount: 42150,
    phone: "+81 570-55-0634",
    websiteUrl: "https://www.tokyo-skytree.jp/en/",
    providerUrl: "https://maps.google.com/?cid=2345678901",
    photos: [
      { ref: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Tokyo Metro / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Japan Views / Unsplash" },
    ],
    reviews: [
      { authorName: "Marcus Vance", rating: 5, text: "Come right around golden hour. Watching the city transition from dusk into an infinite ocean of sparkling neon lights is breathtaking.", relativeTime: "3 weeks ago", authorPhotoUrl: null, googleMapsUri: null },
      { authorName: "Sarah Lin", rating: 4, text: "Incredible engineering and glass floor section. Book elevator tickets in advance to skip the queue.", relativeTime: "2 months ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Harajuku Forest Shrine": {
    category: "shrine",
    summary: "Serene Shinto shrine dedicated to Emperor Meiji, nestled in a lush 170-acre evergreen forest right beside bustling Harajuku.",
    rating: 4.7,
    ratingCount: 51200,
    phone: "+81 3-3379-5511",
    websiteUrl: "https://www.meijijingu.or.jp/en/",
    providerUrl: "https://maps.google.com/?cid=3456789012",
    photos: [
      { ref: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Tokyo Shrines / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1528164344705-475426879c0d?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Japan Heritage / Unsplash" },
    ],
    reviews: [
      { authorName: "David Chen", rating: 5, text: "Stepping off the busy Harajuku street into the shaded gravel forest path immediately brings peace and tranquility. Beautiful wooden torii gates.", relativeTime: "1 week ago", authorPhotoUrl: null, googleMapsUri: null },
      { authorName: "Sophie Martin", rating: 5, text: "We were lucky enough to witness a traditional wedding procession in the main courtyard. Sacred and deeply moving atmosphere.", relativeTime: "a month ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Meiji Jingu": {
    category: "shrine",
    summary: "Serene Shinto shrine dedicated to Emperor Meiji, nestled in a lush 170-acre evergreen forest right beside bustling Harajuku.",
    rating: 4.7,
    ratingCount: 51200,
    phone: "+81 3-3379-5511",
    websiteUrl: "https://www.meijijingu.or.jp/en/",
    providerUrl: "https://maps.google.com/?cid=3456789012",
    photos: [
      { ref: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Tokyo Shrines / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1528164344705-475426879c0d?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Japan Heritage / Unsplash" },
    ],
    reviews: [
      { authorName: "David Chen", rating: 5, text: "Stepping off the busy Harajuku street into the shaded gravel forest path immediately brings peace and tranquility. Beautiful wooden torii gates.", relativeTime: "1 week ago", authorPhotoUrl: null, googleMapsUri: null },
      { authorName: "Sophie Martin", rating: 5, text: "We were lucky enough to witness a traditional wedding procession in the main courtyard. Sacred and deeply moving atmosphere.", relativeTime: "a month ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Shibuya Scramble Lookout": {
    category: "viewpoint",
    summary: "Open-air 360-degree rooftop observatory perched 229 meters above Shibuya Crossing, featuring glass sky-edges, hammocks, and rooftop bar.",
    rating: 4.8,
    ratingCount: 29800,
    phone: "+81 3-4221-0229",
    websiteUrl: "https://www.shibuya-scramble-square.com/sky/",
    providerUrl: "https://maps.google.com/?cid=4567890123",
    photos: [
      { ref: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Shibuya Sky / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Tokyo Skyline / Unsplash" },
    ],
    reviews: [
      { authorName: "Liam O'Connor", rating: 5, text: "Hands down the best view in Tokyo. The corner photo spot looking down at the scramble crossing is surreal. Worth every yen.", relativeTime: "5 days ago", authorPhotoUrl: null, googleMapsUri: null },
      { authorName: "Aya Takahashi", rating: 5, text: "The open-air roof breeze and evening light show are spectacular. Sunset tickets sell out fast!", relativeTime: "3 weeks ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Shibuya Sky": {
    category: "viewpoint",
    summary: "Open-air 360-degree rooftop observatory perched 229 meters above Shibuya Crossing, featuring glass sky-edges, hammocks, and rooftop bar.",
    rating: 4.8,
    ratingCount: 29800,
    phone: "+81 3-4221-0229",
    websiteUrl: "https://www.shibuya-scramble-square.com/sky/",
    providerUrl: "https://maps.google.com/?cid=4567890123",
    photos: [
      { ref: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Shibuya Sky / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Tokyo Skyline / Unsplash" },
    ],
    reviews: [
      { authorName: "Liam O'Connor", rating: 5, text: "Hands down the best view in Tokyo. The corner photo spot looking down at the scramble crossing is surreal. Worth every yen.", relativeTime: "5 days ago", authorPhotoUrl: null, googleMapsUri: null },
      { authorName: "Aya Takahashi", rating: 5, text: "The open-air roof breeze and evening light show are spectacular. Sunset tickets sell out fast!", relativeTime: "3 weeks ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Minato Tower Observatory": {
    category: "viewpoint",
    summary: "Iconic red-and-white communications tower modeled after the Eiffel Tower, commanding views over Roppongi and Tokyo Bay since 1958.",
    rating: 4.5,
    ratingCount: 58100,
    phone: "+81 3-3433-5111",
    websiteUrl: "https://www.tokyotower.co.jp/en/",
    providerUrl: "https://maps.google.com/?cid=5678901234",
    photos: [
      { ref: "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Tokyo Views / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Urban Japan / Unsplash" },
    ],
    reviews: [
      { authorName: "Carlos Gomez", rating: 5, text: "Classic Tokyo nostalgic vibe. The illuminated orange glow against the night sky is iconic.", relativeTime: "2 weeks ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Ueno Garden Park": {
    category: "park",
    summary: "Expansive public cultural park home to historic shrines, Shinobazu Pond, world-class art museums, and over 1,000 blooming cherry trees.",
    rating: 4.5,
    ratingCount: 39200,
    phone: "+81 3-3828-5644",
    websiteUrl: "https://www.kensetsu.metro.tokyo.lg.jp/jimusho/toubuk/ueno/index_top.html",
    providerUrl: "https://maps.google.com/?cid=6789012345",
    photos: [
      { ref: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Ueno Park / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1578637387939-43c525550085?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Cherry Blossoms / Unsplash" },
    ],
    reviews: [
      { authorName: "Emily Watson", rating: 5, text: "Renting swan paddle boats on Shinobazu Pond followed by the Tokyo National Museum was the highlight of our afternoon.", relativeTime: "3 weeks ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Shinjuku Botanical Garden": {
    category: "garden",
    summary: "Splendid 144-acre national garden blending traditional Japanese landscape gardening, English landscape style, and French formal design.",
    rating: 4.7,
    ratingCount: 33600,
    phone: "+81 3-3350-0151",
    websiteUrl: "https://www.env.go.jp/garden/shinjukugyoen/english/",
    providerUrl: "https://maps.google.com/?cid=7890123456",
    photos: [
      { ref: "https://images.unsplash.com/photo-1578637387939-43c525550085?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Shinjuku Gyoen / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Tokyo Nature / Unsplash" },
    ],
    reviews: [
      { authorName: "Thomas Wright", rating: 5, text: "A peaceful oasis right next to the skyscrapers of Shinjuku. The traditional tea house in the Japanese garden is lovely.", relativeTime: "1 month ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Odaiba Seaside Park": {
    category: "park",
    summary: "Scenic coastal park along Tokyo Bay with sandy beaches, boardwalk promenades, waterfront dining, and iconic views of the Rainbow Bridge.",
    rating: 4.4,
    ratingCount: 18900,
    phone: "+81 3-5531-0852",
    websiteUrl: "https://www.tptc.co.jp/en/c_park/01_02",
    providerUrl: "https://maps.google.com/?cid=8901234567",
    photos: [
      { ref: "https://images.unsplash.com/photo-1508873696983-2df5703bc20d?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Odaiba Bay / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Rainbow Bridge / Unsplash" },
    ],
    reviews: [
      { authorName: "Jessica Wong", rating: 5, text: "Stunning sunset views of Tokyo skyline across the bay with the replica Statue of Liberty in the foreground.", relativeTime: "2 weeks ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Toyosu Light Museum": {
    category: "museum",
    summary: "Immersive digital art museum where visitors walk barefoot through water and interact with mind-bending mirror mazes, digital koi, and floating orchids.",
    rating: 4.8,
    ratingCount: 47800,
    phone: "+81 3-5859-0020",
    websiteUrl: "https://planets.teamlab.art/tokyo/",
    providerUrl: "https://maps.google.com/?cid=9012345678",
    photos: [
      { ref: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "teamLab Art / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Digital Lights / Unsplash" },
    ],
    reviews: [
      { authorName: "Chloe Dupont", rating: 5, text: "Completely mesmerising. Walking knee-deep in warm water with digital koi projected around you is unforgettable. Book early!", relativeTime: "4 days ago", authorPhotoUrl: null, googleMapsUri: null },
      { authorName: "Alex Rivera", rating: 5, text: "The Infinite Crystal Universe was transcendent. Like walking through the stars.", relativeTime: "2 weeks ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "teamLab Planets TOKYO DMM": {
    category: "museum",
    summary: "Immersive digital art museum where visitors walk barefoot through water and interact with mind-bending mirror mazes, digital koi, and floating orchids.",
    rating: 4.8,
    ratingCount: 47800,
    phone: "+81 3-5859-0020",
    websiteUrl: "https://planets.teamlab.art/tokyo/",
    providerUrl: "https://maps.google.com/?cid=9012345678",
    photos: [
      { ref: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "teamLab Art / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Digital Lights / Unsplash" },
    ],
    reviews: [
      { authorName: "Chloe Dupont", rating: 5, text: "Completely mesmerising. Walking knee-deep in warm water with digital koi projected around you is unforgettable. Book early!", relativeTime: "4 days ago", authorPhotoUrl: null, googleMapsUri: null },
      { authorName: "Alex Rivera", rating: 5, text: "The Infinite Crystal Universe was transcendent. Like walking through the stars.", relativeTime: "2 weeks ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Akihabara Retro Arcade": {
    category: "entertainment",
    summary: "Legendary multi-floor gaming haven stacked with vintage 80s and 90s CRT arcade cabinets, rhythm games, and rare collectables in electric Akihabara.",
    rating: 4.6,
    ratingCount: 14200,
    phone: "+81 3-5289-9933",
    websiteUrl: "https://www.superpotato.com",
    providerUrl: "https://maps.google.com/?cid=1023456789",
    photos: [
      { ref: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Akihabara Arcades / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Retro Games / Unsplash" },
    ],
    reviews: [
      { authorName: "Nate Robinson", rating: 5, text: "Pure nostalgia trip! Street Fighter II on candy cabs, original Famicoms, and retro Japanese snacks on the top floor.", relativeTime: "1 month ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Hoshi Coffee Kiyosumi": {
    category: "cafe",
    summary: "Celebrated minimalist coffee sanctuary offering bespoke consultations, custom single-origin roast selection, and world-class pour-overs.",
    rating: 4.7,
    ratingCount: 4890,
    phone: "+81 3-5413-9080",
    websiteUrl: "https://koffee-mameya.com",
    providerUrl: "https://maps.google.com/?cid=1123456789",
    photos: [
      { ref: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Specialty Coffee / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Pour Over Bar / Unsplash" },
    ],
    reviews: [
      { authorName: "Julian Baker", rating: 5, text: "A temple for specialty coffee lovers. The barista asked detailed questions about our taste preferences before brewing an exceptional geisha pour over.", relativeTime: "1 week ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Ginza Sushi Counter": {
    category: "restaurant",
    summary: "Intimate 8-seat cypress sushi counter in Ginza serving masterfully aged Edomae nigiri sourced fresh every morning from Toyosu fish market.",
    rating: 4.9,
    ratingCount: 3450,
    phone: "+81 3-3535-3600",
    websiteUrl: "https://www.ginza-sushi.test",
    providerUrl: "https://maps.google.com/?cid=1223456789",
    photos: [
      { ref: "https://images.unsplash.com/photo-1554797589-7241bb691973?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Edomae Sushi / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Sushi Master / Unsplash" },
    ],
    reviews: [
      { authorName: "Hiroshi Yamada", rating: 5, text: "The otoro melted in my mouth. Shari temperature and vinegar seasoning were perfectly balanced. An unforgettable dining experience.", relativeTime: "2 weeks ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Memory Lane Yakitori": {
    category: "restaurant",
    summary: "Atmospheric post-war alleyway packed with rustic tiny izakayas, binchotan charcoal smoke, sizzling skewers, and cold draft beers.",
    rating: 4.6,
    ratingCount: 16800,
    phone: "+81 3-3342-0505",
    websiteUrl: "http://shinjuku-omoide.com",
    providerUrl: "https://maps.google.com/?cid=1323456789",
    photos: [
      { ref: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Omoide Yokocho / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Charcoal Yakitori / Unsplash" },
    ],
    reviews: [
      { authorName: "Rachel Greene", rating: 5, text: "Tiny stalls with 6 seats each, red paper lanterns, and delicious tsukune skewers right off the charcoal grill. Classic Tokyo atmosphere.", relativeTime: "5 days ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Tsukiji Morning Market": {
    category: "market",
    summary: "Historic labyrinth of hundreds of lively street stalls serving flame-torched wagyu skewers, fresh uni bowls, tamagoyaki, and matcha ice cream.",
    rating: 4.6,
    ratingCount: 38700,
    phone: "+81 3-3541-9444",
    websiteUrl: "https://www.tsukiji.or.jp/english/",
    providerUrl: "https://maps.google.com/?cid=1423456789",
    photos: [
      { ref: "https://images.unsplash.com/photo-1534483509719-3feaee7c30da?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Tsukiji Outer Market / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1554797589-7241bb691973?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Street Food / Unsplash" },
    ],
    reviews: [
      { authorName: "Daniel Craig", rating: 5, text: "Arrive hungry by 8:30 AM! The fresh king crab legs and sweet grilled tamagoyaki skewers are out of this world.", relativeTime: "3 days ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Fish Market Tsukiji Outer Market": {
    category: "market",
    summary: "Historic labyrinth of hundreds of lively street stalls serving flame-torched wagyu skewers, fresh uni bowls, tamagoyaki, and matcha ice cream.",
    rating: 4.6,
    ratingCount: 38700,
    phone: "+81 3-3541-9444",
    websiteUrl: "https://www.tsukiji.or.jp/english/",
    providerUrl: "https://maps.google.com/?cid=1423456789",
    photos: [
      { ref: "https://images.unsplash.com/photo-1534483509719-3feaee7c30da?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Tsukiji Outer Market / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1554797589-7241bb691973?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Street Food / Unsplash" },
    ],
    reviews: [
      { authorName: "Daniel Craig", rating: 5, text: "Arrive hungry by 8:30 AM! The fresh king crab legs and sweet grilled tamagoyaki skewers are out of this world.", relativeTime: "3 days ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Kumo Ramen": {
    category: "ramen",
    summary: "Acclaimed tonkotsu ramen shop renowned for its velvety 18-hour broth, springy handcrafted noodles, tender chashu, and customisable spice blend.",
    rating: 4.7,
    ratingCount: 22400,
    phone: "+81 3-3463-3667",
    websiteUrl: "https://ichiran.com/en/",
    providerUrl: "https://maps.google.com/?cid=1523456789",
    photos: [
      { ref: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Ramen Tokyo / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Handcrafted Noodles / Unsplash" },
    ],
    reviews: [
      { authorName: "Kevin Park", rating: 5, text: "The solo dining booth concept lets you completely focus on the rich, creamy broth and springy firm noodles. Perfection in a bowl.", relativeTime: "1 week ago", authorPhotoUrl: null, googleMapsUri: null },
      { authorName: "Maya Patel", rating: 5, text: "Best ramen I had in Japan. Customize with extra garlic, half-boiled egg, and firm noodles for the best experience.", relativeTime: "2 weeks ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Kumo Ramen Shibuya": {
    category: "ramen",
    summary: "Acclaimed tonkotsu ramen shop renowned for its velvety 18-hour broth, springy handcrafted noodles, tender chashu, and customisable spice blend.",
    rating: 4.7,
    ratingCount: 22400,
    phone: "+81 3-3463-3667",
    websiteUrl: "https://ichiran.com/en/",
    providerUrl: "https://maps.google.com/?cid=1523456789",
    photos: [
      { ref: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Ramen Tokyo / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Handcrafted Noodles / Unsplash" },
    ],
    reviews: [
      { authorName: "Kevin Park", rating: 5, text: "The solo dining booth concept lets you completely focus on the rich, creamy broth and springy firm noodles. Perfection in a bowl.", relativeTime: "1 week ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "Kumo Ramen Shinjuku": {
    category: "ramen",
    summary: "Acclaimed tonkotsu ramen shop in Shinjuku renowned for its velvety broth, springy handcrafted noodles, tender chashu, and customisable chili sauce.",
    rating: 4.6,
    ratingCount: 19800,
    phone: "+81 3-3354-0120",
    websiteUrl: "https://ichiran.com/en/",
    providerUrl: "https://maps.google.com/?cid=1623456789",
    photos: [
      { ref: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Ramen Tokyo / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Handcrafted Noodles / Unsplash" },
    ],
    reviews: [
      { authorName: "Kevin Park", rating: 5, text: "Velvety tonkotsu broth and perfectly tender chashu pork. Open late night which is perfect after exploring Shinjuku.", relativeTime: "2 weeks ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
  "ICHIRAN Shibuya": {
    category: "ramen",
    summary: "Acclaimed tonkotsu ramen shop renowned for its velvety 18-hour broth, springy handcrafted noodles, tender chashu, and customisable spice blend.",
    rating: 4.7,
    ratingCount: 22400,
    phone: "+81 3-3463-3667",
    websiteUrl: "https://ichiran.com/en/",
    providerUrl: "https://maps.google.com/?cid=1523456789",
    photos: [
      { ref: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Ramen Tokyo / Unsplash" },
      { ref: "https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=1200&q=80", width: 1200, height: 800, attribution: "Handcrafted Noodles / Unsplash" },
    ],
    reviews: [
      { authorName: "Kevin Park", rating: 5, text: "The solo dining booth concept lets you completely focus on the rich, creamy broth and springy firm noodles. Perfection in a bowl.", relativeTime: "1 week ago", authorPhotoUrl: null, googleMapsUri: null },
    ],
  },
};

function enrichDetails(details: Record<string, unknown>, name: string): void {
  const match = VENUES[name] ?? Object.entries(VENUES).find(([k]) => name.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(name.toLowerCase()))?.[1];
  if (!match) return;

  if (!details.photos || (Array.isArray(details.photos) && details.photos.length === 0)) {
    details.photos = match.photos;
  }
  if (!details.summary) {
    details.summary = match.summary;
  }
  if (details.rating == null) {
    details.rating = match.rating;
  }
  if (details.ratingCount == null) {
    details.ratingCount = match.ratingCount;
  }
  if (!details.phone) {
    details.phone = match.phone;
  }
  if (!details.websiteUrl) {
    details.websiteUrl = match.websiteUrl;
  }
  if (!details.providerUrl) {
    details.providerUrl = match.providerUrl;
  }
  if (!details.reviews || (Array.isArray(details.reviews) && details.reviews.length === 0)) {
    details.reviews = match.reviews;
  }
  if (Array.isArray(details.unknownFields)) {
    details.unknownFields = (details.unknownFields as string[]).filter(
      (f) => !["photos", "summary", "rating", "phone", "websiteUrl", "reviews"].includes(f)
    );
  }
}

function run() {
  const dbPath = path.resolve(".local/dev-data/db.json");
  if (!fs.existsSync(dbPath)) {
    console.error("db.json not found at", dbPath);
    process.exit(1);
  }

  const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  let enrichedCount = 0;

  for (const place of db.places ?? []) {
    let touched = false;
    if (place.selected?.details) {
      enrichDetails(place.selected.details, place.selected.name || place.name);
      touched = true;
    }
    for (const opt of place.options ?? []) {
      if (opt.details) {
        enrichDetails(opt.details, opt.name || place.name);
        touched = true;
      }
    }
    if (touched) enrichedCount++;
  }

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
  console.log(`Enriched ${enrichedCount} places in ${dbPath} with lively photos, descriptions, ratings, and reviews.`);
}

run();
