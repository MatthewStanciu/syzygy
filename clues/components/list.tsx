"use client";

import { useState } from "react";
import { motion } from "framer-motion";

export function List({ phrases }: { phrases: string[] }) {
  const [ingredients, setIngredients] = useState<string[]>([]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-black px-8 pb-32 pt-24 text-white">
      <div className="z-10 w-full max-w-sm items-center justify-between text-sm lg:flex">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b  border-neutral-800 bg-zinc-800/30 bg-gradient-to-b from-inherit pb-4 pt-6 backdrop-blur-2xl lg:static lg:w-auto lg:rounded-xl lg:border lg:bg-gray-200 lg:bg-zinc-800/30 lg:p-4">
          Purdue Hackers&nbsp;
          <strong className="font-bold">Bar</strong>
        </p>
        <div className="pointer-events-none fixed bottom-0 left-0 flex h-48 w-full items-end justify-center bg-gradient-to-t from-black via-black pb-12 lg:static lg:h-auto lg:w-auto lg:bg-none lg:pb-0">
          <motion.button
            className="pointer-events-auto"
            onClick={() => {
              const randomphrases = [...phrases]
                .sort(() => Math.random() - Math.random())
                .slice(0, 5);
              setIngredients(randomphrases);
            }}
            whileTap={{ scale: 0.9 }}
            whileHover={{ rotate: -180 }}
            transition={{ type: "spring", stiffness: 256, damping: 18 }}
          >
            <svg
              width={48}
              height={48}
              viewBox="0 0 32 32"
              className="fill-primary"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M6.70533 19.6863C6.94679 19.1719 7.16632 18.639 7.38413 18.1102C7.41062 18.0463 7.43702 17.9824 7.46338 17.9187C7.52401 17.772 7.58443 17.6259 7.64523 17.4811C7.84274 17.0089 8.37901 16.8042 8.83677 17.0366C9.28132 17.2622 9.47761 17.8132 9.28498 18.2727L9.28427 18.2739C9.19987 18.4767 9.11431 18.6829 9.02928 18.891L9.02779 18.8946C8.50296 20.171 7.94489 21.5283 7.11209 22.6161L7.11041 22.6176C6.95013 22.8231 6.724 23.0648 6.39945 23.1518C6.07587 23.2385 5.75818 23.1425 5.51664 23.0446L5.51541 23.0439C4.23026 22.5093 3.10832 21.6411 2.01636 20.796C1.8308 20.6521 1.64673 20.5099 1.46194 20.3689C1.06659 20.068 0.958901 19.4922 1.23204 19.0743C1.51225 18.6441 2.07932 18.5543 2.48622 18.8635C2.66707 19.0014 2.84721 19.1405 3.02613 19.2789L3.02762 19.2806C3.65953 19.7687 4.28773 20.254 4.94696 20.6684C2.60418 15.1659 4.6847 8.65442 9.99488 5.58858C14.3176 3.09286 19.5477 3.59226 23.282 6.4429L22.6747 7.23773L22.0675 8.03256C18.9555 5.65703 14.5971 5.24086 10.9949 7.32063C6.63416 9.83829 4.88702 15.1443 6.70533 19.6863Z" />
              <path d="M22.0675 8.03256C22.5056 8.36877 23.1334 8.28613 23.4696 7.84797C23.8058 7.40981 23.7231 6.78207 23.285 6.44586L22.0675 8.03256Z" />
              <path d="M9.92229 23.9292C13.0342 26.3047 17.3926 26.7209 20.9949 24.6411C25.3732 22.1133 27.1168 16.7746 25.2623 12.2205C25.0033 12.7637 24.7704 13.329 24.5394 13.8899L24.4602 14.0811C24.3996 14.2277 24.339 14.3743 24.2783 14.5189C24.0808 14.9911 23.5445 15.1959 23.0867 14.9634C22.6422 14.7378 22.4459 14.1868 22.6385 13.7273L22.6393 13.7261C22.7237 13.5233 22.8092 13.3171 22.8942 13.109L22.8957 13.1054C23.4206 11.829 23.9786 10.4717 24.8114 9.38391L24.8131 9.38243C24.9734 9.17694 25.1995 8.93518 25.5241 8.84821C25.8477 8.76151 26.1653 8.85756 26.4069 8.95538L26.4081 8.95608C27.6933 9.49068 28.8152 10.3589 29.9072 11.2041C30.0927 11.3479 30.2768 11.4901 30.4616 11.6311C30.8569 11.932 30.9646 12.5078 30.6915 12.9257C30.4113 13.3559 29.8442 13.4457 29.4373 13.1365C29.2565 12.9986 29.0763 12.8595 28.8974 12.7211L28.8959 12.7194C28.3 12.2591 27.7073 11.8013 27.0889 11.4031C29.3578 16.8821 27.2698 23.3277 21.9949 26.3732C17.673 28.8684 12.4442 28.3697 8.71004 25.5206C8.27188 25.1844 8.18904 24.5569 8.52525 24.1187C8.86003 23.6825 9.4844 23.598 9.92229 23.9292Z" />
            </svg>
          </motion.button>
        </div>
      </div>

      <ul className="mx-auto w-full max-w-sm">
        {phrases.map((phrase) => (
          <li
            key={phrase}
            className={`relative mb-4 px-6 py-1 text-center text-3xl`}
          >
            {ingredients.includes(phrase) && (
              <motion.span
                layoutId={`bubble-${ingredients.indexOf(phrase)}`}
                className="bg-primary absolute inset-0 mix-blend-lighten"
                style={{ borderRadius: 9999 }}
                transition={{
                  type: "spring",
                  bounce: 0.2,
                  duration: 0.6,
                }}
                initial={false}
              />
            )}
            {phrase}
          </li>
        ))}
      </ul>

      <footer className="opacity-50">
        by{" "}
        <a
          href="https://lachlanjc.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          @lachlanjc
        </a>
      </footer>
    </main>
  );
}
