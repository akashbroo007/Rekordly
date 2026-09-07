import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function PageContainer({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={`flex h-full flex-col gap-6 overflow-y-auto p-6 ${className ?? ''}`}
    >
      {children}
    </motion.div>
  );
}
