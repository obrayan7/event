import { resetPassword } from "../actions";

export const metadata = { title: "Nouveau mot de passe", robots: { index: false } };

export default function ResetPage({ searchParams }: { searchParams: { token?: string; error?: string } }) {
  return (
    <div className="wrap page narrow">
      <h1>Nouveau mot de passe</h1>
      {searchParams.error && <p className="alert" role="alert">{searchParams.error}</p>}
      <form action={resetPassword} className="form">
        <input type="hidden" name="token" value={searchParams.token ?? ""} />
        <label>Nouveau mot de passe <span className="hint">(8 caractères minimum)</span>
          <input type="password" name="password" autoComplete="new-password" minLength={8} required />
        </label>
        <button type="submit">Enregistrer</button>
      </form>
    </div>
  );
}
