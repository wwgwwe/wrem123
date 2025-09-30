import React, { useState, useCallback, useEffect } from 'react';
import { fileToBase64 } from '../utils/fileUtils';
import { generateSnapshotImage } from '../services/geminiService';
import type { GeneratedImage } from '../types';
import { CloseIcon, PlusCircleIcon } from './icons';

type ShootingMode = 'personal' | 'couple';
type Gender = 'female' | 'male';
type StyleTheme = 'wedding' | 'daily' | 'travel' | 'film' | 'fashion' | 'party' | 'seasonal' | 'random';
type UploadedImage = { data: string; mime: string; url: string };

const THEMES: { id: StyleTheme, name: string }[] = [
    { id: 'wedding', name: '웨딩 스냅' },
    { id: 'daily', name: '일상 스냅' },
    { id: 'travel', name: '여행 스냅' },
    { id: 'film', name: '필름 / 레트로' },
    { id: 'fashion', name: '패션 화보'},
    { id: 'party', name: '파티 / 이벤트'},
    { id: 'seasonal', name: '계절 / 시즌'},
    { id: 'random', name: '랜덤 스냅'},
];

const ImageUploader: React.FC<{
    image: UploadedImage | null;
    onFileSelect: (file: File) => void;
    onClear: () => void;
    isDraggingOver: boolean;
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
    inputId: string;
}> = ({ image, onFileSelect, onClear, isDraggingOver, onDragOver, onDragLeave, onDrop, inputId }) => {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) onFileSelect(e.target.files[0]);
        e.target.value = '';
    };

    return (
        <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`relative w-full h-40 bg-[var(--bg-tertiary)] rounded-lg flex items-center justify-center border-2 border-dashed ${isDraggingOver ? 'border-[var(--border-accent)] bg-[var(--bg-interactive)]' : 'border-[var(--border-secondary)]'} transition-colors`}
        >
            {image ? (
                <>
                    <img src={image.url} alt="Uploaded" className="w-full h-full object-contain rounded-md p-1" />
                    <button onClick={onClear} className="absolute top-2 right-2 bg-[var(--bg-primary)]/70 text-white rounded-full p-1 hover:bg-[var(--bg-negative)] transition-colors">
                        <CloseIcon className="w-4 h-4" />
                    </button>
                </>
            ) : (
                <label htmlFor={inputId} className="cursor-pointer text-center text-[var(--text-secondary)] p-2">
                    <PlusCircleIcon className="w-10 h-10 mx-auto mb-2 text-[var(--text-secondary)]" />
                    <p className="text-sm">클릭 또는 드래그</p>
                </label>
            )}
            <input id={inputId} type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
        </div>
    );
};

export const SnapshotGeneratorTool: React.FC<{
  addToHistory: (image: GeneratedImage) => void;
  onImageClick: (image: GeneratedImage) => void;
}> = ({ addToHistory, onImageClick }) => {
    const [shootingMode, setShootingMode] = useState<ShootingMode>('personal');
    const [personalImage, setPersonalImage] = useState<UploadedImage | null>(null);
    const [coupleImage1, setCoupleImage1] = useState<UploadedImage | null>(null);
    const [coupleImage2, setCoupleImage2] = useState<UploadedImage | null>(null);
    const [gender, setGender] = useState<Gender>('female');
    const [coupleGenders, setCoupleGenders] = useState<[Gender, Gender]>(['female', 'male']);
    const [styleTheme, setStyleTheme] = useState<StyleTheme>('wedding');
    const [generationCount, setGenerationCount] = useState(8);
    const [generatedImages, setGeneratedImages] = useState<(GeneratedImage | null)[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragTarget, setDragTarget] = useState<string | null>(null);

    const processFile = useCallback(async (file: File, target: 'personal' | 'couple1' | 'couple2') => {
        if (!file || !file.type.startsWith('image/')) {
            setError('유효한 이미지 파일을 업로드해주세요.');
            return;
        }
        try {
            const { base64, mimeType } = await fileToBase64(file);
            const newImage = { data: base64, mime: mimeType, url: `data:${mimeType};base64,${base64}` };
            if (target === 'personal') setPersonalImage(newImage);
            else if (target === 'couple1') setCoupleImage1(newImage);
            else setCoupleImage2(newImage);
            setError(null);
        } catch (err) {
            setError('이미지 파일을 불러올 수 없습니다.');
        }
    }, []);

    const getPromptVariations = useCallback((count: number): string[] => {
        const variations: Record<Exclude<StyleTheme, 'random'>, string[]> = {
            wedding: [
                'in a romantic wedding ceremony setting', 'walking hand-in-hand through a beautiful garden, smiling', 'a close-up shot, looking lovingly at each other during sunset', 'joyfully celebrating with confetti falling around them', 'sharing a gentle kiss under a floral arch', 'a classic portrait in elegant wedding attire against a grand backdrop', 'dancing together at the reception, lit by string lights', 'sitting on a bench in a park, sharing a quiet, intimate moment', 'posing playfully for the camera, showing their rings', 'a candid shot capturing a moment of laughter and happiness',
                'preparing in the bridal room before the ceremony', 'exchanging vows at the altar with emotional expressions', 'cutting the wedding cake together', 'having their first dance as a married couple', 'a toast with champagne glasses', 'walking down the aisle, showered with petals', 'a dramatic shot with a flowing wedding veil', 'posing with a decorated vintage wedding car', 'a candid moment interacting with family members', 'the bride throwing the bouquet to her friends',
                'a beautiful close-up shot of the wedding dress details', 'signing the marriage certificate', 'a playful piggyback ride after the ceremony', 'looking out a grand window together, contemplating the future', 'a silhouette against a dramatic sunset', 'a close-up of intertwined hands showing off their new rings', 'a scene from a traditional Korean pyebaek ceremony', 'getting ready with bridesmaids and groomsmen, sharing laughs', 'a tearful, emotional moment during the vows', 'making a grand entrance to the reception hall',
                'a magical exit at night surrounded by sparklers', 'posing at a historic venue like an old castle or estate', 'on a grand, sweeping staircase', 'departing in a helicopter for their honeymoon', 'a serene seaside wedding on a sandy beach', 'an intimate elopement ceremony in a lush forest', 'a cozy winter wedding by a decorated fireplace', 'a chic rooftop wedding with stunning city views', 'a casual pre-wedding photoshoot in everyday clothes', 'driving away in a classic convertible with a "Just Married" sign',
                'a dramatic photo in the rain under a single, elegant umbrella', 'playfully feeding each other a piece of wedding cake', 'sharing a quiet moment away from the bustling reception', 'a flat-lay shot featuring the wedding invitation suite', 'a creative shot using reflections in a puddle or window', 'a high-angle shot of the entire ceremony from above', 'a funny, unposed moment that captures their personalities', 'a stylish close-up on the bride\'s designer shoes', 'a detailed shot of the groom\'s boutonnière and tie', 'a heartwarming portrait with both sets of parents'
            ],
            daily: [
                'enjoying coffee at a cozy, sunlit cafe', 'strolling through a bustling city street, laughing together', 'cooking a meal together in a modern kitchen, playfully interacting', 'relaxing on a sofa at home, watching a movie with snacks', 'taking a selfie with a funny face in a park', 'walking a dog on a sunny afternoon', 'shopping at a local farmer\'s market, looking at fresh produce', 'reading books side-by-side in a library or bookstore', 'having a picnic on a green lawn with a checkered blanket', 'a candid shot captured during a lively conversation',
                'doing laundry together, playfully throwing clothes', 'trying to assemble IKEA furniture with confused expressions', 'painting a room in their new apartment, splattered with paint', 'watering plants together in a home garden or on a balcony', 'intensely focused on a competitive board game', 'a fun video game session on a large TV', 'a peaceful morning yoga routine in the living room', 'having a lazy breakfast in bed on a weekend', 'brushing teeth together in front of the bathroom mirror', 'visiting a modern art museum or gallery',
                'following a new recipe from a cookbook with concentration', 'listening to vinyl records on a vintage turntable', 'a candid shot while commuting on a crowded bus or subway', 'window shopping along a fashionable street', 'feeding ducks at a serene pond', 'visiting a cat or dog cafe, surrounded by animals', 'taking a pottery class, hands covered in clay', 'attending an indie music concert or live show', 'grocery shopping and playfully riding on the shopping cart', 'a quiet evening on the balcony, watching the city lights',
                'building a cozy pillow fort in the living room', 'looking through old photo albums and reminiscing', 'a stylish selfie in an elevator mirror', 'working together on a large jigsaw puzzle', 'a workout session at a modern, well-lit gym', 'stargazing at night from a dark location', 'visiting a large aquarium, mesmerized by the fish', 'riding bicycles along a scenic river path', 'a spontaneous water fight in the backyard', 'enjoying ice cream cones that are dripping on a hot day',
                'a close-up of their hands holding steaming mugs of tea', 'a cozy scene reading by a crackling fireplace', 'working from home together in a shared office space', 'a candid shot while one is playing a musical instrument like a guitar or piano', 'a hilarious karaoke night at home or in a bar', 'taking a professional cooking class together', 'visiting a vibrant and colorful flower market', 'a silhouette of them looking out a window on a rainy day', 'trying on funny hats and glasses in a vintage store', 'a shot that reflects a shared hobby, like painting or collecting'
            ],
            travel: [
                'posing in front of an iconic landmark like the Eiffel Tower', 'looking at a map together on a quaint European street', 'enjoying the view from a scenic mountain top after a hike', 'relaxing on a tropical beach with clear turquoise water', 'exploring historic, ancient ruins like the Colosseum in Rome', 'looking out the window of a high-speed train passing through the countryside', 'walking through a vibrant, colorful foreign market', 'hiking on a misty trail in a lush rainforest', 'enjoying a boat ride on a serene, mirror-like lake', 'a selfie with a famous cityscape like Tokyo in the background at night',
                'riding a vintage scooter through the rolling hills of Tuscany, Italy', 'enjoying exotic street food in a bustling night market in Bangkok, Thailand', 'watching a traditional Geisha performance in Kyoto, Japan', 'on an African safari, observing wildlife from a jeep', 'gazing up at the magical Northern Lights in Iceland', 'looking out over the vast expanse of the Grand Canyon', 'walking hand-in-hand on the Great Wall of China', 'taking a romantic gondola ride through the canals of Venice', 'posing with a classic red telephone booth in London', 'riding camels through the Sahara desert at sunset',
                'scuba diving among colorful coral reefs in the Great Barrier Reef', 'wine tasting at a beautiful vineyard in Napa Valley', 'exploring the colorful, vintage-car-filled streets of Havana, Cuba', 'throwing a coin into the Trevi Fountain in Rome for good luck', 'looking up in awe at the intricate architecture of the Sagrada Familia in Barcelona', 'soaring in a hot air balloon over the fairy chimneys of Cappadocia, Turkey', 'visiting a bustling, aromatic souk in Marrakech, Morocco', 'posing in front of the ancient pyramids of Giza in Egypt', 'relaxing in the geothermal waters of the Blue Lagoon in Iceland', 'exploring a medieval castle in the Scottish Highlands',
                'a candid shot at an airport terminal, looking excited', 'trying on traditional local clothing and posing for a photo', 'on a scenic road trip in a classic convertible car', 'dancing at a local festival or carnival', 'a photo of just their feet in the sand with the waves washing over', 'getting playfully lost in the maze-like streets of an old town', 'enjoying cocktails at a rooftop bar with a panoramic city view', 'visiting a world-famous art museum like the Louvre or the Met', 'skiing or snowboarding down a pristine, snowy mountain', 'posing together by a powerful, majestic waterfall',
                'a shot from inside a cozy tent while camping in the wilderness', 'looking at a large departure board at an international airport', 'eating authentic gelato on a street corner in Italy', 'a funny photo interacting with a famous statue', 'visiting a serene Buddhist temple in Southeast Asia', 'exploring a colorful colonial town in South America', 'crossing a famous bridge like the Golden Gate Bridge or Brooklyn Bridge', 'a creative flat-lay of their passports, tickets, and a map', 'taking a picture of interesting local wildlife from a safe distance', 'a candid moment of joyful exhaustion after a long day of exploring'
            ],
            film: [
                'in a retro 1980s style, with vibrant neon lights and vintage arcade machines in the background', 'in a grainy, high-contrast black and white photo with dramatic, stark lighting', 'in a cinematic shot with a very wide 2.35:1 aspect ratio, like a still from a blockbuster movie', 'with warm, golden hour lighting and beautiful lens flare creating a nostalgic, dreamy mood', 'as a vintage polaroid-style snapshot with faded, muted colors and a classic white border', 'in a moody, low-key lighting scene reminiscent of film noir, with long shadows and a sense of mystery', 'as if shot on expired film, with unexpected light leaks and unpredictable, beautiful color shifts', 'as a dreamy, soft-focus portrait with a very shallow depth of field, blurring the background into a painterly bokeh', 'as a candid street photography shot in the gritty, authentic style of the 1970s', 'using a Dutch angle for a dynamic, unsettling, and dramatic feel',
                'a shot with perfect symmetry and a quirky pastel color palette, in the style of Wes Anderson', 'a low-angle shot with intense expressions, reminiscent of a Quentin Tarantino film', 'a magical and gentle scene inspired by Studio Ghibli, with soft light and a sense of wonder', 'a cyberpunk aesthetic like Blade Runner, with pouring rain, reflective streets, and glowing neon signs', 'a classic Hollywood romance scene from the 1950s, elegant and timeless', 'a gritty action movie hero pose with a determined look', 'a suspenseful horror movie moment, lit by a single flashlight beam', 'a comedic scene with wide-eyed, exaggerated expressions of surprise', 'a joyful scene from a musical, captured mid-dance or mid-song', 'an epic fantasy scene like The Lord of the Rings, with dramatic landscapes',
                'a science-fiction scene inside a futuristic spaceship cockpit, with glowing control panels', 'a classic western movie standoff at high noon in a dusty town', 'a historical drama with authentic, detailed period costumes and setting', 'a found-footage style shot with a shaky, handheld camera effect for realism', 'a dramatic slow-motion walk towards the camera', 'a split-screen effect showing two different perspectives or actions at once', 'a silhouette against a massive, fiery explosion in the background', 'an extreme close-up on the eyes to capture a dramatic, emotional moment', 'a shot looking through a rain-streaked window, creating a melancholic mood', 'a long take-style walking shot through a bustling environment',
                'a lens whacking effect creating dreamy, ethereal light leaks', 'an anamorphic lens flare effect, with distinctive horizontal flares', 'a scene from a silent film, using only dramatic gestures and expressions to tell the story', 'a God\'s-eye-view shot from directly above, showing patterns and scale', 'a spy thriller scene with a secretive, clandestine mood in a European city', 'a documentary-style candid interview shot with natural lighting', 'a super telephoto shot that dramatically compresses the background, making distant objects appear closer', 'a fisheye lens perspective for a quirky, distorted, and immersive look', 'a shot with heavy smoke or fog to create an atmospheric and mysterious scene', 'a scene that perfectly mimics a famous movie poster',
                'a shot with a background filled with beautiful bokeh from city lights at night', 'a classic character introduction shot, using a slow zoom to reveal them', 'a freeze-frame action shot capturing a peak moment of intensity', 'a shot with a strong, stylized color grade, like the popular teal and orange look', 'a scene from a coming-of-age movie, filled with nostalgia and a sense of longing', 'a frantic, handheld camera shot during a high-stakes chase scene', 'a shot with selective focus on a small, significant detail or object', 'a scene from a sports movie capturing the crucial, game-winning moment', 'a fractured reflection in a broken mirror to symbolize inner conflict', 'a shot using creative shadows to tell a story or create a dramatic shape'
            ],
            fashion: [
                'posing for a high-fashion magazine cover shoot with dramatic, artistic lighting', 'confidently walking down a runway during a fashion show, wearing avant-garde clothing', 'a candid street style shot in a trendy urban environment like New York, Paris, or Seoul', 'in a minimalist studio, wearing haute couture, with a focus on the unique silhouette and form', 'a stunning beauty shot focusing on intricate makeup and statement accessories, with flawless, glowing skin', 'a dynamic action shot, captured mid-motion, with fabric flowing elegantly in the wind', 'in a vintage-themed fashion shoot, perfectly recreating a classic look from the 1960s', 'an artistic, editorial shot with a creative, surreal, or abstract concept', 'a polished, commercial lookbook photo for a well-known luxury brand', 'a candid backstage photo, capturing the energy and chaos before a fashion show',
                'posing elegantly next to a sleek, luxury sports car', 'a powerful, confident pose in a business-chic power suit against a modern architectural background', 'a bohemian, free-spirited look in a field of wildflowers at sunset', 'a cool, grunge-style outfit in an abandoned, graffiti-covered building', 'a futuristic, sci-fi inspired outfit with metallic fabrics and unconventional materials', 'a classic preppy look on a beautiful, ivy-league university campus', 'an athletic-leisure (athleisure) outfit in a modern, minimalist gym setting', 'a punk-rock look with a leather jacket, ripped jeans, and boots in an urban alley', 'a romantic, fairytale look in a flowing dress in front of a majestic castle', 'a dark, Goth fashion style in a dramatic, moody setting like a historic cemetery or dark forest',
                'a chic resort wear look by a luxurious infinity pool', 'an extreme close-up on a pair of designer shoes, showing off the details', 'a detailed shot of a luxury handbag, styled as a product photo', 'a shot featuring bold, statement jewelry as the main focus', 'an outfit with vibrant, bold patterns and daringly clashing colors', 'a striking monochrome outfit, all in one color from head to toe', 'a stylish, layered outfit perfect for an autumn day in the city', 'a cozy and chic winter fashion look in a snowy landscape', 'a light and airy summer dress on a picturesque beach', 'a vibrant spring outfit in a blooming, colorful garden',
                'a shot that emphasizes the rich texture and material of the fabric', 'a dramatic silhouette shot against a brightly lit background', 'a powerful pose against a cold, concrete brutalist architecture background', 'a playful, whimsical shot with a bunch of colorful balloons', 'a creative reflection in a shop window, blending the street scene with the outfit', 'a shot from a very low angle to emphasize height, long legs, and a sense of power', 'a shot capturing a professional model\'s walk, full of confidence and movement', 'a candid moment while getting hair and makeup professionally done for a shoot', 'a high-fashion photo shoot that includes an animal, like a graceful dog or a majestic horse', 'a shot using creative props like mirrors, prisms, or colored gels for artistic effects',
                'a high-contrast, black and white fashion portrait with a focus on form and emotion', 'an avant-garde look using unconventional, recycled, or surprising materials', 'a cool shot featuring stylish sunglasses with an interesting reflection in the lenses', 'a look inspired by a specific historical era, like the Roaring Twenties or Victorian times', 'an outfit designed for a glamorous red carpet event, full of sparkle and elegance', 'a cozy and stylish loungewear shot in a beautifully decorated home', 'a shot that specifically emphasizes the interesting back details of an outfit', 'a creative pose where the body forms an interesting, artistic shape', 'a dramatic shot using colored smoke bombs for a vibrant and moody effect', 'a photo with a strong focus on a unique and elaborate hairstyle'
            ],
            party: [
                'celebrating at a New Year\'s Eve party with spectacular fireworks in the background', 'dancing under a glittering disco ball at a lively, crowded club', 'at a birthday party, happily blowing out candles on a beautifully decorated cake', 'enjoying a vibrant summer music festival with a large, energetic crowd', 'at a formal black-tie gala event, wearing elegant evening attire', 'laughing with friends at a casual backyard barbecue party on a sunny day', 'a candid photo of them dancing enthusiastically on a wedding reception dance floor', 'at a creative costume party, dressed in a fun and elaborate outfit', 'raising a glass of champagne for a toast at a celebratory dinner', 'surrounded by falling balloons and confetti, looking absolutely joyful',
                'at a mysterious masquerade ball, wearing elegant masks and formal wear', 'enjoying a chic rooftop party with a stunning panoramic city view at night', 'at a color-themed party, for example, an all-white party on a yacht', 'having fun at a foam party at a vibrant beach club', 'at a silent disco, wearing glowing headphones and dancing to their own beat', 'relaxing and laughing at a pool party with fun, inflatable toys', 'at a holiday-themed ugly sweater party with festive decorations', 'sitting around a warm bonfire on the beach at night with friends', 'singing their hearts out with passion during a karaoke night', 'at a graduation party, joyfully tossing their graduation caps in the air',
                'hosting a housewarming party in their new, stylishly decorated home', 'intensely focused and laughing during a game night with board games and friends', 'mingling at a fancy cocktail party with beautifully crafted drinks', 'the exact moment of a surprise party, with a shocked and happy expression', 'at a tailgating party before a big sports game, full of team spirit', 'at a theme party based on a popular movie or a specific decade like the 80s', 'at a sweet and decorated baby shower, celebrating new life', 'enjoying a fun boat party on a sunny day with clear blue water', 'at a festival of lights, like Diwali or a traditional Lantern Festival, surrounded by beautiful lights', 'exploring a lively street festival with food trucks, music, and crowds',
                'a candid shot of them telling a funny story and making friends laugh', 'playfully acting out something during a game of charades or Pictionary', 'a fun group photo with everyone making silly faces or poses', 'a delicious-looking shot of the food and drinks table at a party', 'a moment of deep connection or conversation amidst a crowded, noisy party', 'a close-up shot of clinking glasses during a toast', 'a candid photo of them laughing uncontrollably at a joke', 'happily receiving a thoughtfully wrapped gift', 'a sophisticated scene at a gallery opening or art exhibition', 'a professional networking event or a book launch party',
                'letting loose at a company holiday party', 'giving a heartfelt speech at a retirement party', 'having fun at a bachelorette or bachelor party', 'celebrating a milestone birthday like a sweet sixteen or a quinceañera', 'enjoying the rides and games at a local carnival or fair', 'participating in a lively local community block party', 'a dynamic shot of them dancing wildly and without a care', 'having a quiet, intimate conversation in a corner away from the main party action', 'a shot of them being the center of attention, perhaps on a stage or being celebrated', 'a candid shot of them enjoying the music and soaking in the atmosphere'
            ],
            seasonal: [
                'in a snowy winter landscape, wearing warm clothes and holding a steaming mug', 'relaxing on a bright, sunny beach during summer, with sunglasses and a book', 'surrounded by golden and red autumn leaves in a beautiful park, wearing a cozy sweater', 'among blooming, pink cherry blossom trees in a serene park in spring', 'playfully carving a pumpkin for Halloween, with spooky decorations around them', 'opening presents with excitement in front of a decorated Christmas tree', 'at a vibrant summer fair with a colorful ferris wheel in the background', 'wearing a traditional outfit while celebrating a cultural holiday like Lunar New Year or Chuseok', 'standing in a vast field of sunflowers under a clear blue summer sky', 'ice skating gracefully at an outdoor rink in a city during winter',
                '(Spring) having a romantic picnic under a canopy of cherry blossom trees', '(Spring) flying a colorful kite in a windy, green field', '(Spring) walking through a vibrant field of tulips in the Netherlands', '(Spring) enjoying a spring rain shower with a bright, cheerful umbrella', '(Spring) visiting a lush botanical garden, surrounded by exotic flowers in full bloom', '(Summer) eating a juicy slice of watermelon on a porch on a hot day', '(Summer) watching a movie at an outdoor cinema screening in a park at night', '(Summer) happily building an intricate sandcastle on the beach', '(Summer) having a fun, energetic water balloon fight in a backyard', '(Summer) watching a beautiful, colorful sunset over the ocean',
                '(Autumn) visiting a pumpkin patch to pick the perfect pumpkin', '(Autumn) trying to find their way out of a large, challenging corn maze', '(Autumn) drinking hot apple cider by a warm, crackling bonfire on a cool evening', '(Autumn) wearing cozy flannel shirts while walking through a forest with colorful foliage', '(Autumn) enjoying a festive Thanksgiving dinner with family and a table full of food', '(Winter) working together to build a friendly snowman with a carrot nose', '(Winter) drinking hot chocolate with marshmallows by a cozy fireplace', '(Winter) skiing or snowboarding down a snowy mountain with a scenic view', '(Winter) watching the first peaceful snowfall of the season from inside a warm house', '(Winter) walking through a magical, brightly lit European Christmas market at night',
                'a creative photo collage showing them in the same spot during all four seasons', 'celebrating Valentine\'s Day surrounded by red roses and heart-shaped decorations', 'on a fun Easter egg hunt in a garden on a sunny spring day', 'celebrating the 4th of July, watching a spectacular fireworks display', 'wearing green and celebrating at a lively St. Patrick\'s Day parade', 'having a romantic, candlelit Valentine\'s dinner', 'wearing beautiful traditional attire for a Lunar New Year celebration', 'at a fall harvest festival, surrounded by seasonal produce and activities', 'on a fun summer road trip with the windows down', 'planting flowers in a garden to welcome the spring',
                'enjoying a cozy indoor activity, like baking cookies, on a snowy day', 'a shot featuring iconic seasonal foods, like summer BBQ or a winter stew', 'a moment of pure joy discovering the first flowers of spring', 'a nostalgic, golden-hour shot capturing the last warm days of summer', 'a walk on a crisp, clear autumn morning with visible breath', 'a magical winter evening with snow gently falling under streetlights', 'celebrating a local seasonal festival, like a maple syrup festival or a lavender festival', 'wearing colorful rain boots and joyfully jumping in puddles after a spring shower', 'collectively gathering a bouquet of colorful autumn leaves', 'a shot with a beautifully decorated Christmas house in the background'
            ],
        };
        
        let selectedVars: string[];
        const isRandom = styleTheme === 'random';

        if (isRandom) {
            const allPrompts = Object.values(variations).flat();
            selectedVars = [...allPrompts].sort(() => 0.5 - Math.random());
        } else {
            selectedVars = [...variations[styleTheme]].sort(() => 0.5 - Math.random());
        }
        
        const base = `Generate a high-quality, photorealistic snapshot. It is absolutely critical that you preserve the exact facial features and identity of the person/people from the source image(s). Only change their clothing, pose, and the surrounding scene. The final image must look like a real photograph.`;
        
        let personDesc = '';
        if (shootingMode === 'personal') {
            personDesc = `The photo features a single ${gender === 'female' ? 'woman' : 'man'}`;
        } else {
            const genderToString = (g: Gender) => g === 'female' ? 'woman' : 'man';
            personDesc = `The photo features the couple from the source images together, a ${genderToString(coupleGenders[0])} and a ${genderToString(coupleGenders[1])}`;
        }

        return Array.from({ length: count }, (_, i) => {
            const themeName = isRandom ? 'Random Snap' : THEMES.find(t => t.id === styleTheme)?.name || 'Snapshot';
            return `${base} Theme: ${themeName}. ${personDesc}, ${selectedVars[i % selectedVars.length]}.`
        });
    }, [styleTheme, gender, shootingMode, coupleGenders]);

    const handleGenerate = useCallback(async (isMore = false) => {
        if (shootingMode === 'personal' && !personalImage) return setError('개인 사진을 업로드해주세요.');
        if (shootingMode === 'couple' && (!coupleImage1 || !coupleImage2)) return setError('커플 사진 2장을 모두 업로드해주세요.');

        setIsGenerating(true);
        setError(null);
        if (!isMore) setGeneratedImages([]);

        const prompts = getPromptVariations(generationCount);
        const newPlaceholders = Array(generationCount).fill(null);
        const startIndex = isMore ? generatedImages.length : 0;
        setGeneratedImages(prev => isMore ? [...prev, ...newPlaceholders] : newPlaceholders);

        const timestamp = Date.now();
        const date = new Date(timestamp);
        const folderName = `스냅사진_${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
        
        const imagesToGenerate: { data: string, mimeType: string }[] = [];
        if (shootingMode === 'personal' && personalImage) {
            imagesToGenerate.push({ data: personalImage.data, mimeType: personalImage.mime });
        } else if (shootingMode === 'couple' && coupleImage1 && coupleImage2) {
            imagesToGenerate.push({ data: coupleImage1.data, mimeType: coupleImage1.mime });
            imagesToGenerate.push({ data: coupleImage2.data, mimeType: coupleImage2.mime });
        }

        const promises = prompts.map((prompt, i) => 
            generateSnapshotImage(imagesToGenerate, prompt)
                .then(newImageSrc => {
                    const newImage: GeneratedImage = {
                        id: `${timestamp}-${startIndex + i}`, src: newImageSrc, name: `Snapshot ${startIndex + i + 1}`, folder: folderName, timestamp
                    };
                    addToHistory(newImage);
                    setGeneratedImages(prev => {
                        const updated = [...prev];
                        updated[startIndex + i] = newImage;
                        return updated;
                    });
                })
                .catch(err => console.error(`Failed to generate image ${startIndex + i + 1}:`, err))
        );
        await Promise.all(promises);
        setIsGenerating(false);
    }, [shootingMode, personalImage, coupleImage1, coupleImage2, getPromptVariations, addToHistory, generatedImages.length, generationCount]);

    const renderStep = (num: number, title: string, content: React.ReactNode) => (
        <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl">
            <div className="flex items-center mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--bg-accent)] text-[var(--text-on-accent)] font-bold mr-3 text-sm">{num}</span>
                <h3 className="text-lg font-semibold">{title}</h3>
            </div>
            {content}
        </div>
    );
    
    return (
        <div className="flex h-full gap-8">
            <aside className="w-[400px] flex-shrink-0 flex flex-col gap-6">
                {renderStep(1, "촬영 모드 선택", (
                    <div className="grid grid-cols-2 gap-2 bg-[var(--bg-primary)] p-1 rounded-lg">
                       <button onClick={() => setShootingMode('personal')} className={`py-2 text-sm font-bold rounded-md transition-colors ${shootingMode === 'personal' ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)] shadow-lg' : 'hover:bg-[var(--bg-tertiary)]'}`}>개인 촬영</button>
                       <button onClick={() => setShootingMode('couple')} className={`py-2 text-sm font-bold rounded-md transition-colors ${shootingMode === 'couple' ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)] shadow-lg' : 'hover:bg-[var(--bg-tertiary)]'}`}>커플 촬영</button>
                    </div>
                ))}

                {renderStep(2, "사진 업로드", (
                    <div className="space-y-3">
                        {shootingMode === 'personal' ? (
                            <ImageUploader image={personalImage} onFileSelect={(f) => processFile(f, 'personal')} onClear={() => setPersonalImage(null)} isDraggingOver={dragTarget === 'personal'} onDragOver={(e) => { e.preventDefault(); setDragTarget('personal'); }} onDragLeave={() => setDragTarget(null)} onDrop={(e) => { e.preventDefault(); setDragTarget(null); processFile(e.dataTransfer.files[0], 'personal'); }} inputId="personal-upload" />
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <ImageUploader image={coupleImage1} onFileSelect={(f) => processFile(f, 'couple1')} onClear={() => setCoupleImage1(null)} isDraggingOver={dragTarget === 'couple1'} onDragOver={(e) => { e.preventDefault(); setDragTarget('couple1'); }} onDragLeave={() => setDragTarget(null)} onDrop={(e) => { e.preventDefault(); setDragTarget(null); processFile(e.dataTransfer.files[0], 'couple1'); }} inputId="couple1-upload" />
                                    <div className="grid grid-cols-2 gap-1 bg-[var(--bg-primary)] p-1 rounded-lg mt-2">
                                        <button onClick={() => setCoupleGenders(p => ['female', p[1]])} className={`py-1 text-xs rounded ${coupleGenders[0] === 'female' ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)]' : 'hover:bg-[var(--bg-tertiary)]'}`}>여성</button>
                                        <button onClick={() => setCoupleGenders(p => ['male', p[1]])} className={`py-1 text-xs rounded ${coupleGenders[0] === 'male' ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)]' : 'hover:bg-[var(--bg-tertiary)]'}`}>남성</button>
                                    </div>
                                </div>
                                <div>
                                    <ImageUploader image={coupleImage2} onFileSelect={(f) => processFile(f, 'couple2')} onClear={() => setCoupleImage2(null)} isDraggingOver={dragTarget === 'couple2'} onDragOver={(e) => { e.preventDefault(); setDragTarget('couple2'); }} onDragLeave={() => setDragTarget(null)} onDrop={(e) => { e.preventDefault(); setDragTarget(null); processFile(e.dataTransfer.files[0], 'couple2'); }} inputId="couple2-upload" />
                                    <div className="grid grid-cols-2 gap-1 bg-[var(--bg-primary)] p-1 rounded-lg mt-2">
                                        <button onClick={() => setCoupleGenders(p => [p[0], 'female'])} className={`py-1 text-xs rounded ${coupleGenders[1] === 'female' ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)]' : 'hover:bg-[var(--bg-tertiary)]'}`}>여성</button>
                                        <button onClick={() => setCoupleGenders(p => [p[0], 'male'])} className={`py-1 text-xs rounded ${coupleGenders[1] === 'male' ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)]' : 'hover:bg-[var(--bg-tertiary)]'}`}>남성</button>
                                    </div>
                                </div>
                            </div>
                        )}
                        <p className="text-xs text-[var(--text-secondary)] text-center">얼굴이 선명하게 나온 사진일수록 결과물이 좋습니다.</p>
                    </div>
                ))}

                {renderStep(3, "생성 옵션", (
                    <div className="space-y-4">
                        {shootingMode === 'personal' && (
                            <div>
                                <h4 className="text-md font-medium text-[var(--text-primary)] mb-2">성별</h4>
                                <div className="grid grid-cols-2 gap-2 bg-[var(--bg-primary)] p-1 rounded-lg">
                                    <button onClick={() => setGender('female')} className={`py-2 text-sm rounded-md ${gender === 'female' ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)]' : 'hover:bg-[var(--bg-tertiary)]'}`}>여성</button>
                                    <button onClick={() => setGender('male')} className={`py-2 text-sm rounded-md ${gender === 'male' ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)]' : 'hover:bg-[var(--bg-tertiary)]'}`}>남성</button>
                                </div>
                            </div>
                        )}
                        <div>
                            <h4 className="text-md font-medium text-[var(--text-primary)] mb-2">스타일 컨셉</h4>
                            <div className="grid grid-cols-4 gap-2">
                                {THEMES.map(theme => (
                                    <button key={theme.id} onClick={() => setStyleTheme(theme.id)} className={`py-2 px-1 text-xs rounded-md ${styleTheme === theme.id ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)]' : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-interactive)]'}`}>{theme.name}</button>
                                ))}
                            </div>
                        </div>
                         <div>
                            <h4 className="text-md font-medium text-[var(--text-primary)] mb-2">생성 개수: <span className="font-bold text-[var(--border-accent)]">{generationCount}</span></h4>
                            <input 
                                type="range" 
                                min="1" 
                                max="10" 
                                value={generationCount} 
                                onChange={(e) => setGenerationCount(Number(e.target.value))}
                                className="w-full h-2 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:bg-[var(--bg-accent)] [&::-moz-range-thumb]:bg-[var(--bg-accent)]"
                            />
                        </div>
                    </div>
                ))}
                
                 {renderStep(4, "스냅사진 생성", (
                     <>
                        <button onClick={() => handleGenerate(false)} disabled={isGenerating} className="w-full bg-[var(--bg-accent)] text-[var(--text-on-accent)] font-bold py-3 px-6 rounded-lg hover:bg-[var(--bg-accent-hover)] transition-colors disabled:bg-[var(--bg-disabled)] disabled:cursor-not-allowed flex items-center justify-center">
                            {isGenerating && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>}
                            {isGenerating ? '생성 중...' : `${generationCount}개 생성 시작`}
                        </button>
                        {error && <p className="text-[var(--bg-negative)] mt-2 text-sm text-center">{error}</p>}
                        <p className="text-xs text-[var(--text-secondary)] text-center mt-3">버튼을 클릭하여 {generationCount}개의 특별한 스냅사진을 생성하세요.</p>
                    </>
                 ))}
            </aside>
            
            <main className="flex-1 bg-[var(--bg-primary)] p-6 rounded-lg shadow-xl flex flex-col">
                 <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-[var(--text-accent)]">갤러리</h2>
                    {generatedImages.length > 0 && !isGenerating && (
                        <button onClick={() => handleGenerate(true)} className="bg-[var(--bg-info)] text-[var(--text-on-accent)] font-bold py-2 px-4 rounded-lg hover:bg-[var(--bg-info-hover)] flex items-center gap-2 text-sm">
                            <PlusCircleIcon className="w-5 h-5"/>
                            {generationCount}장 더 생성
                        </button>
                    )}
                 </div>
                 <div className="flex-grow overflow-y-auto pr-2">
                    {generatedImages.length > 0 || isGenerating ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {generatedImages.map((image, index) => (
                                <button key={index} onClick={() => image && onImageClick(image)} disabled={!image} className="relative aspect-square bg-[var(--bg-secondary)] rounded-lg overflow-hidden shadow-md group disabled:cursor-default">
                                    {!image && isGenerating && (
                                        <div className="absolute inset-0 flex items-center justify-center z-10">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--border-accent)]"></div>
                                        </div>
                                    )}
                                    {image && <img src={image.src} alt={image.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-center text-[var(--text-secondary)]">
                            <p>생성된 스냅사진이 여기에 표시됩니다.</p>
                        </div>
                    )}
                 </div>
            </main>
        </div>
    );
};