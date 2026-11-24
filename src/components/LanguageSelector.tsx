import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/i18n/config';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from 'sonner';

interface Props {
  variant?: 'compact' | 'pill';
}

export default function LanguageSelector({ variant = 'compact' }: Props) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);

  const current = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0];

  const handleSelect = async (code: LanguageCode) => {
    await i18n.changeLanguage(code);
    const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
    if (lang) toast.success(`${lang.flag} ${lang.label}`);
    setOpen(false);
  };

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.92 }}
        aria-label={t('common.language')}
        className={
          variant === 'pill'
            ? 'flex items-center gap-1.5 px-3 h-9 rounded-full bg-secondary/60 hover:bg-secondary text-foreground text-sm font-semibold transition-colors'
            : 'flex items-center gap-1 h-9 px-2.5 rounded-full bg-secondary/60 hover:bg-secondary text-foreground text-xs font-bold transition-colors'
        }
      >
        <Globe className="w-3.5 h-3.5 text-muted-foreground" />
        <span>{current.short}</span>
        <span className="text-sm leading-none">{current.flag}</span>
      </motion.button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle>{t('language.selectTitle')}</SheetTitle>
            <SheetDescription>{t('language.selectDesc')}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-1 pb-6">
            <AnimatePresence>
              {SUPPORTED_LANGUAGES.map((lang, i) => {
                const active = lang.code === i18n.language;
                return (
                  <motion.button
                    key={lang.code}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => handleSelect(lang.code)}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-2xl transition-all ${
                      active
                        ? 'bg-primary/15 border border-primary/30'
                        : 'hover:bg-secondary/60 border border-transparent'
                    }`}
                  >
                    <span className="text-2xl">{lang.flag}</span>
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-foreground text-body">{lang.label}</p>
                      <p className="text-caption text-muted-foreground">{lang.short}</p>
                    </div>
                    {active && <Check className="w-5 h-5 text-primary" />}
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
