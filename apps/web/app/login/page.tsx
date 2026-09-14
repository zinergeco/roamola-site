function LoginForm({ from, error }: { from: string; error: boolean }) {
  return (
    <form
      method="POST"
      action="/api/login"
      style={{
        width: "min(360px, 100%)",
        background: "var(--panel)",
        border: "1px solid var(--line-bright)",
        borderRadius: 10,
        padding: "2rem",
      }}
    >
      <p
        className="font-disp"
        style={{
          fontSize: ".72rem",
          color: "var(--brass)",
          letterSpacing: ".05em",
          margin: "0 0 .6rem",
          textTransform: "uppercase",
        }}
      >
        Roamola — build access
      </p>
      <h1
        className="font-disp"
        style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 .5rem", color: "var(--paper)" }}
      >
        This is a work in progress
      </h1>
      <p style={{ color: "var(--mist)", fontSize: ".9rem", margin: "0 0 1.5rem" }}>
        Everything past this point is unfinished and not for public
        consumption. Enter the build password to continue.
      </p>

      <input type="hidden" name="from" value={from} />

      <label
        htmlFor="password"
        style={{ display: "block", fontSize: ".78rem", color: "var(--mist)", marginBottom: ".4rem" }}
      >
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoFocus
        required
        style={{
          background: "var(--void)",
          border: "1px solid var(--line-bright)",
          borderRadius: 6,
          padding: ".65rem .8rem",
          color: "var(--paper)",
          fontSize: ".9rem",
          fontFamily: "var(--sans)",
          width: "100%",
          marginBottom: "1.1rem",
        }}
      />

      {error && (
        <p style={{ color: "var(--coral)", fontSize: ".82rem", margin: "-.6rem 0 1rem" }}>
          Wrong password. Try again.
        </p>
      )}

      <button
        type="submit"
        style={{
          fontFamily: "var(--sans)",
          fontWeight: 600,
          fontSize: ".85rem",
          padding: ".68rem 1.15rem",
          borderRadius: 6,
          border: "1px solid transparent",
          cursor: "pointer",
          background: "var(--brass)",
          color: "var(--void)",
          width: "100%",
        }}
      >
        Enter
      </button>
    </form>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const params = await searchParams;
  const from = params.from && params.from.startsWith("/") ? params.from : "/";
  const error = params.error === "1";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        background:
          "radial-gradient(circle at 50% 0%, var(--hull), var(--void) 60%)",
      }}
    >
      <LoginForm from={from} error={error} />
    </main>
  );
}
