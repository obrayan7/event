import { requestPasswordReset } from "../actions";

export const metadata = { title: "Mot de passe oublié" };

export default function ForgotPage({ searchParams }: { searchParams: { sent?: string; error?: string } }) {
  return (
    <div className="wrap page narrow">
      <h1>Mot de passe oublié</h1>
      {searchParams.error && <p className="alert" role="alert">{searchParams.error}</p>}
      {searchParams.sent ? (
        <p role="status">Si un compte existe avec cette adresse, un e-mail contenant un lien de réinitialisation vient d&apos;être envoyé (valable 1 heure).</p>
      ) : (
        <form action={requestPasswordReset} className="form">
          <label>E-mail <input type="email" name="email" autoComplete="username" required /></label>
          <button type="submit">Envoyer le lien</button>
        </form>
      )}
    </div>
  );
}
