"use client";

import { motion } from "framer-motion";
import { StarIcon } from "lucide-react";

interface LanguageRatingProps {
  rating: number;
}

export const LanguageRating: React.FC<LanguageRatingProps> = ({ rating }) => {
  if (!rating) {
    return null;
  }

  return (
    <motion.div
      className="flex self-end items-center gap-1"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <StarIcon className="fill-yellow-500" size={12} />
      <p className="text-sm">{rating}</p>
    </motion.div>
  );
};
