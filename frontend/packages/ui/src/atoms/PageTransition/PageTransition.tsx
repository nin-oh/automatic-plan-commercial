import { motion } from 'framer-motion';

/** Subtle fade+slide on route change. Wrap the inner Routes block in this
 * inside an `<AnimatePresence mode="wait">` for the page-to-page transition. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
