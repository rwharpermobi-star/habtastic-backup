export const AVATAR_STYLES = {
  'Funky & Colorful': 'color-block streetwear, playful contrasting colors, cheeky confident energy',
  'Punk & Rebellious': 'punk jacket with a few studs, rebellious grin, vivid high-contrast styling',
  'Hip-Hop & Streetwear': 'oversized streetwear hoodie, graphic color blocks, self-assured relaxed pose',
  'Retro & Vintage': 'vintage patterned shirt, nostalgic jewel-tone palette, charismatic retro styling',
  'Rock & Roll': 'rock-inspired jacket and bandana detail, spirited grin, dramatic stage-style rim lighting',
  'Bold & Edgy': 'angular fashion, striking contrast, defiant but friendly expression',
  'Natural & Healthy': 'fresh casual clothing, organic vivid greens, open upbeat expression',
  'Fitness & Athletic': 'colorful athletic top, sporty shoulder detail, energetic confident expression',
  'Professional & Stylish': 'fashion-forward tailored blazer, bold tasteful accent, charismatic rather than corporate',
  'Calm & Mindful': 'relaxed soft-textured clothing, tranquil teal palette, gentle expressive smile',
  'Creative & Artistic': 'artfully patterned clothing, unexpected complementary colors, mischievous creative energy',
  'Fantasy & Neon': 'imaginative futuristic clothing, luminous neon accents, magical but clearly human cartoon character',
  Professional: 'stylish tailored blazer, expressive confident personality, no corporate stock-avatar look',
  'Energetic & Bold': 'bright sporty casual clothing, enthusiastic grin and bold color contrasts',
} as const;

export const AVATAR_GENDERS = ['Surprise me', 'Male', 'Female'] as const;
export const AVATAR_AGES = ['Teen', 'Young Adult', '30s-40s', 'Mature'] as const;
export const FREE_AVATAR_LIMIT = 3;
export const PREMIUM_AVATAR_LIMIT = 30;

export type AvatarPreferences = { gender: typeof AVATAR_GENDERS[number]; ageRange: typeof AVATAR_AGES[number]; style: keyof typeof AVATAR_STYLES };
export type AvatarSpecification = Record<string, string>;

// Legacy backend-only styles stay accepted without crowding the picker.
const legacyStyles: Record<string, string> = {
  sporty: 'Fitness & Athletic', athletic: 'Fitness & Athletic', punk: 'Punk & Rebellious',
  rock: 'Rock & Roll', nerd: 'Professional & Stylish', geek: 'Professional & Stylish',
  hippie: 'Calm & Mindful', boho: 'Creative & Artistic', business: 'Professional',
  formal: 'Professional', artist: 'Creative & Artistic', creative: 'Creative & Artistic',
  zen: 'Calm & Mindful', yoga: 'Calm & Mindful', foodie: 'Natural & Healthy',
  chef: 'Natural & Healthy', gamer: 'Fantasy & Neon', nature: 'Natural & Healthy',
  outdoor: 'Natural & Healthy', adventurer: 'Natural & Healthy',
};

export function parsePreferences(input: unknown): AvatarPreferences {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid avatar preferences');
  const value = input as Record<string, unknown>;
  const gender = value.gender ?? 'Surprise me';
  const ageRange = value.ageRange ?? 'Young Adult';
  const rawStyle = value.style ?? 'Funky & Colorful';
  const style = typeof rawStyle === 'string' ? legacyStyles[rawStyle.toLowerCase()] ?? rawStyle : rawStyle;
  if (!AVATAR_GENDERS.includes(gender as AvatarPreferences['gender'])) throw new Error('Choose a supported gender');
  if (!AVATAR_AGES.includes(ageRange as AvatarPreferences['ageRange'])) throw new Error('Choose a supported age range');
  if (typeof style !== 'string' || !Object.prototype.hasOwnProperty.call(AVATAR_STYLES, style)) throw new Error('Choose a supported avatar style');
  return { gender: gender as AvatarPreferences['gender'], ageRange: ageRange as AvatarPreferences['ageRange'], style: style as AvatarPreferences['style'] };
}

export const HAIR_STYLES = [
  'towering neon mohawk', 'long liberty spikes', 'multicolor punk spikes', 'shaggy mullet', 'curly mullet',
  'fauxhawk with shaved sides', 'high undercut', 'sharp fade with etched patterns', 'high-top fade',
  'wide sculpted afro', 'rounded afro with colored tips', 'short springy curls', 'dense coiled high-top',
  'long locs with colorful beads', 'short locs', 'two-tone twists', 'thick box braids', 'cornrows with geometric parting',
  'long flowing waves', 'short textured crop', 'asymmetrical bob', 'messy rock hair', 'side-swept fringe',
  'spiky anime-inspired hair', 'bald head with bold brows', 'shaved geometric patterns', 'rainbow braided updo',
];
const hairColors = ['black', 'dark brown', 'chestnut', 'blonde', 'copper', 'silver', 'electric blue', 'neon green', 'pastel pink', 'lavender', 'orange-red', 'rainbow', 'split-dye magenta and cyan', 'two-tone black and lime', 'teal roots fading into violet', 'natural dark hair with neon tips'];
const skinTones = ['very fair cool', 'fair warm', 'light olive', 'golden tan', 'medium olive', 'warm medium brown', 'deep brown', 'rich dark brown', 'deep ebony'];
const facialHair = ['clean-shaven', 'designer stubble', 'bold handlebar mustache', 'pencil mustache', 'goatee', 'short shaped beard', 'large full beard', 'curly beard', 'braided beard with beads', 'mutton chops'];

export function buildSpecification(preferences: AvatarPreferences, gender: string, previous?: AvatarSpecification | null, random: () => number = () => {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return (value[0] ?? 0) / 4294967296;
}): AvatarSpecification {
  const pick = (key: string, options: string[]) => {
    const pool = options.length > 1 ? options.filter(option => option !== previous?.[key]) : options;
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? options[0] ?? 'none';
  };
  const teen = preferences.ageRange === 'Teen';
  return {
    gender, ageRange: preferences.ageRange, style: preferences.style,
    headProportions: pick('headProportions', ['slightly oversized rounded head with natural shoulders', 'gently enlarged oval head with relaxed shoulders', 'soft round head with broad shoulders', 'tall oval head with slim shoulders']),
    faceShape: pick('faceShape', ['round cheeks and tiny chin', 'long narrow face and broad jaw', 'heart-shaped face with pointed chin', 'square face with soft cheeks', 'asymmetrical expressive cheeks']),
    skinTone: pick('skinTone', skinTones),
    facialStructure: pick('facialStructure', ['wide cheekbones and gently curved jaw', 'high cheekbones and rounded jaw', 'soft full cheeks and narrow chin', 'angular cheekbones and broad chin', 'subtle mixed-heritage facial structure']),
    hairstyle: pick('hairstyle', HAIR_STYLES),
    hairTexture: pick('hairTexture', ['straight', 'wavy', 'curly', 'tightly coiled', 'sculpted textured']),
    hairColor: pick('hairColor', hairColors),
    eyes: pick('eyes', ['big round eyes', 'small bright eyes', 'one eyebrow raised over asymmetrically sized eyes', 'almond-shaped eyes', 'wide-set lively eyes', 'narrow smiling eyes']),
    eyeColor: pick('eyeColor', ['brown', 'hazel', 'green', 'blue', 'amber', 'gray']),
    eyebrows: pick('eyebrows', ['thick expressive brows', 'fine arched brows', 'one raised angular brow', 'bold straight brows']),
    nose: pick('nose', ['tiny button nose', 'broad rounded nose', 'long curved nose', 'short upturned nose', 'angular prominent nose']),
    mouth: pick('mouth', ['full lips and cheeky closed smile', 'wide open grin with a small front-tooth gap', 'asymmetrical smirk and thin lips', 'big toothy smile with varied tooth sizes', 'soft smile and pronounced dimples']),
    facialHair: teen ? 'clean-shaven' : pick('facialHair', facialHair),
    glasses: pick('glasses', ['none', 'none', 'reading glasses', 'oversized round frames', 'thick colorful square frames', 'tiny retro frames', 'cat-eye frames', 'sport wraparound sunglasses', 'bold tinted sunglasses']),
    accessory: pick('accessory', ['none', 'none', 'large hoop earrings', 'small hoop earrings', 'mismatched earrings', 'single stud', 'ear cuff', 'small nose ring', 'septum ring', 'layered ear studs']),
    skinDetail: pick('skinDetail', teen ? ['none', 'freckles', 'beauty mark', 'dimples'] : ['none', 'freckles', 'beauty mark', 'dimples', 'small abstract face tattoo', 'visible neck tattoo', 'light arm or collarbone tattoo', 'colorful cheek art']),
    clothing: AVATAR_STYLES[preferences.style],
    background: pick('background', ['solid saturated cyan', 'solid vivid coral', 'solid electric violet', 'solid lime', 'solid cobalt', 'solid warm yellow']),
    lighting: pick('lighting', ['soft key light and crisp cyan rim light', 'bright diffused studio lighting', 'warm key light and cool rim lighting', 'clean cinematic cartoon lighting']),
  };
}

export function buildPrompt(specification: AvatarSpecification): string {
  return `Create EXACTLY ONE individual high-quality 3D Pixar-style cartoon portrait avatar for the HabTastic app in a "funky fresh" colourful street style. This is a SINGLE CHARACTER PORTRAIT, never a lineup, collage, group, sheet, multiple people, character selection screen, UI screenshot, or poster.
Follow this independently sampled character specification precisely: ${JSON.stringify(specification)}.
The selected gender, age range and style are mandatory. Teen means visibly 15–17, age-appropriate clothing, no tattoos, no beard, no sexualization; Mature means 50+ with expressive smile lines. 30s-40s means visibly adult, not a teenager.
VISUAL SIGNATURE: polished animated-film 3D render with big expressive eyes, soft studio lighting, detailed hair strands and fabric textures, warm friendly expression and appealing slightly stylized proportions. Head-and-shoulders portrait: the head and hair occupy about 50–60% of the square image. Show only one character from upper chest upward, centered, facing camera or turned slightly three-quarter, with the entire hairstyle inside safe margins. Keep eyes, glasses, facial details and silhouette clear at small mobile-icon size and inside a circular crop.
FUNKY FRESH STREET STYLE: bold colourful track jackets, hoodies, denim vests with simple pins, patterned shirts, studded leather jackets for punk looks, playful geometric prints, chunky but tasteful jewelry, oversized colorful sunglasses or thick reading glasses when selected, high-top fades, sculpted afros, mullets, mohawks, shaved lightning-bolt or geometric hair patterns, braids, locs and other distinct cartoon haircuts. Mix clashing neon and pastel accents confidently. Apply tattoos, piercings, facial hair or cheek art only when specified and age-appropriate; tattoos are light, simple shapes (stars, flowers, birds) with no words. Never draw scars. Older characters are just as funky and stylish as young ones. Keep styling expressive, cheeky, cool and friendly rather than aggressive.
Make the sampled specification visually obvious, especially hairstyle, hair color, eye shape, glasses, facial hair, accessory and clothing. Use different eye sizes and expressions across successive generations—some large cartoon eyes, some small or squinty eyes—and avoid repetitive generic faces. Use the specified skin tone and facial structure respectfully; do not claim or infer a specific racial identity from facial features. Keep all details coherent and readable.
Use a clean single-color or softly graded vibrant background from the specified background value, with subtle studio glow. Do NOT place other characters, graffiti text, words, slogans, brand logos, sports team jerseys, interface controls, borders, watermarks, UI panels or background people in the image. No photorealism, no duplicate heads, no cropped hair, no extra limbs, no hidden eyes. Strictly family-friendly: no nudity, sexual or suggestive content, violence, blood, weapons, drugs, alcohol, smoking, hate symbols, or offensive gestures. Deliver one finished square avatar image suitable for saving as a user's profile picture.`;
}
