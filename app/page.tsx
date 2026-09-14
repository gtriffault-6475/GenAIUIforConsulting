// Placeholder confirming the scaffold boots with fonts and tokens applied
// (see Story 1.1). Story 1.2 replaces this with the project selector.
export default function Home() {
  return (
    <main
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <span className="text-display" style={{ color: 'var(--color-accent)' }}>
        GenAI4Consulting
      </span>
    </main>
  );
}
