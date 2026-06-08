import './globals.css';

export const metadata = {
  title: '阿瓦隆 · AI 谋略局',
  description: '六大国产 AI 自动玩阿瓦隆 —— 任务、潜伏、刺杀,看谁是真正的谋略家',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
