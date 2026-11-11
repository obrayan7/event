import Link from "next/link";
import { register } from "../actions";

export const metadata = { title: "Créer un compte" };

export default function RegisterPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="wrap page narrow">
      <h1>Créer un compte</h1>
      {searchParams.error && <p className="alert" role="alert">{searchParams.error}</p>}
      <form action={register} className="form">
        <label>Nom <span className="hint">(facultatif)</span><input name="name" autoComplete="name" /></label>
        <label>E-mail <input type="email" name="email" autoComplete="email" required /></label>
        <label>Mot de passe <span className="hint">(8 caractères minimum)</span><input type="password" name="password" autoComplete="new-password" minLength={8} required /></label>
        <button type="submit">Créer mon compte</button>
        <p className="hint">En créant un compte, vous acceptez notre <Link href="/confidentialite">politique de confidentialité</Link>.</p>
      </form>
      <p>Déjà inscrit ? <Link href="/compte/connexion">Se connecter</Link></p>
    </div>
  );
}
