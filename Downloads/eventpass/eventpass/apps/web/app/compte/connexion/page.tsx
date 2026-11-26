import Link from "next/link";
import { login } from "../actions";

export const metadata = { title: "Connexion" };

export default function LoginPage({ searchParams }: { searchParams: { error?: string; reset?: string } }) {
  return (
    <div className="wrap page narrow">
      <h1>Connexion</h1>
      {searchParams.reset && <p role="status">Mot de passe modifié. Vous pouvez vous connecter.</p>}
      {searchParams.error && <p className="alert" role="alert">{searchParams.error}</p>}
      <form action={login} className="form">
        <label>E-mail <input type="email" name="email" autoComplete="username" required /></label>
        <label>Mot de passe <input type="password" name="password" autoComplete="current-password" required /></label>
        <button type="submit">Se connecter</button>
      </form>
      <p><Link href="/compte/mot-de-passe-oublie">Mot de passe oublié ?</Link></p>
      <p>Pas encore de compte ? <Link href="/compte/inscription">Créer un compte</Link></p>
    </div>
  );
}
