'use client';

import { Toaster } from 'react-hot-toast';

export default function ToasterProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          fontFamily: '"Hanken Grotesk", "Segoe UI", system-ui, sans-serif',
          fontSize: '14px',
          fontWeight: 500,
          borderRadius: '10px',
          // shadow matches --shadow-md from gildedglow tokens
          boxShadow: '0 6px 16px -4px rgba(60,46,20,.13), 0 2px 6px rgba(60,46,20,.06)',
        },
        success: {
          iconTheme: { primary: '#0E9F6E', secondary: '#fff' },
        },
        error: {
          iconTheme: { primary: '#D5402F', secondary: '#fff' },
        },
      }}
    />
  );
}
