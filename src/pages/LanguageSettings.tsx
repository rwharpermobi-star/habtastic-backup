import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Check, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', native: 'Français', flag: '🇫🇷' },
  { code: 'ar', name: 'Arabic', native: 'العربية', flag: '🇸🇦' },
  { code: 'arz', name: 'Egyptian Arabic', native: 'العربية المصرية', flag: '🇪🇬' },
  { code: 'zh', name: 'Chinese', native: '中文', flag: '🇨🇳' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', flag: '🇮🇳' },
  { code: 'pt', name: 'Portuguese', native: 'Português', flag: '🇧🇷' },
  { code: 'ru', name: 'Russian', native: 'Русский', flag: '🇷🇺' },
  { code: 'ja', name: 'Japanese', native: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', native: '한국어', flag: '🇰🇷' },
  { code: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', native: 'Italiano', flag: '🇮🇹' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe', flag: '🇹🇷' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl', name: 'Polish', native: 'Polski', flag: '🇵🇱' },
  { code: 'th', name: 'Thai', native: 'ไทย', flag: '🇹🇭' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'ms', name: 'Malay', native: 'Bahasa Melayu', flag: '🇲🇾' },
  { code: 'sv', name: 'Swedish', native: 'Svenska', flag: '🇸🇪' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська', flag: '🇺🇦' },
  { code: 'ro', name: 'Romanian', native: 'Română', flag: '🇷🇴' },
  { code: 'el', name: 'Greek', native: 'Ελληνικά', flag: '🇬🇷' },
  { code: 'he', name: 'Hebrew', native: 'עברית', flag: '🇮🇱' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', flag: '🇧🇩' },
  { code: 'ur', name: 'Urdu', native: 'اردو', flag: '🇵🇰' },
  { code: 'fil', name: 'Filipino', native: 'Filipino', flag: '🇵🇭' },
  { code: 'sw', name: 'Swahili', native: 'Kiswahili', flag: '🇰🇪' },
  { code: 'xh', name: 'Xhosa', native: 'isiXhosa', flag: '🇿🇦' },
  { code: 'yo', name: 'Yoruba', native: 'Yorùbá', flag: '🇳🇬' },
  { code: 'ha', name: 'Hausa', native: 'Hausa', flag: '🇳🇬' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', flag: '🇮🇳' },
];

export default function LanguageSettings() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const [selected, setSelected] = useState(i18n.language?.split('-')[0] || 'en');
  const [search, setSearch] = useState('');

  const filtered = LANGUAGES.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.native.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = async (code: string) => {
    setSelected(code);
    await i18n.changeLanguage(code);
    const lang = LANGUAGES.find(l => l.code === code);
    toast.success(`Language set to ${lang?.name} ${lang?.flag}`);
  };

  return (
    <motion.div
      className="min-h-screen pb-24 bg-background"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/40 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/profile')} className="p-1.5 rounded-xl hover:bg-secondary/60 transition-colors">
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="text-body-lg font-bold text-foreground">App Language</h1>
      </div>

      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search languages..."
            className="pl-9 bg-secondary/50 border-border/40 rounded-xl"
          />
        </div>
      </div>

      <div className="px-4 space-y-1 mt-2">
        {filtered.map((lang, i) => (
          <motion.button
            key={lang.code}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            onClick={() => handleSelect(lang.code)}
            className={`w-full flex items-center gap-3 p-3.5 rounded-xl transition-all ${
              selected === lang.code
                ? 'bg-primary/15 border border-primary/30'
                : 'hover:bg-secondary/50 border border-transparent'
            }`}
          >
            <span className="text-2xl">{lang.flag}</span>
            <div className="flex-1 text-left">
              <p className="font-medium text-body text-foreground">{lang.name}</p>
              <p className="text-caption text-muted-foreground">{lang.native}</p>
            </div>
            {selected === lang.code && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                <Check className="w-5 h-5 text-primary" />
              </motion.div>
            )}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
