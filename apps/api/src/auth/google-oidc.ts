import * as client from "openid-client";
import type { Env } from "../config/env.js";

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

/** The Google login steps that the API uses. Tests replace it through the GOOGLE_OIDC token. */
export interface GoogleOidc {
  authorizationUrl(input: { state: string; codeVerifier: string; redirectUri: string }): Promise<string>;
  /** callbackUrl is GOOGLE_CALLBACK_URL with the query that Google sent. */
  exchange(input: { callbackUrl: URL; codeVerifier: string; state: string }): Promise<GoogleProfile>;
}

export const GOOGLE_OIDC = Symbol("GOOGLE_OIDC");

const GOOGLE_ISSUER = new URL("https://accounts.google.com");
const SCOPES = "openid email profile";

/** The real Google client. It reads the Google metadata at the first login, not at start. */
export class OpenIdGoogleOidc implements GoogleOidc {
  private config: Promise<client.Configuration> | null = null;

  constructor(private readonly env: Env) {}

  async authorizationUrl(input: { state: string; codeVerifier: string; redirectUri: string }): Promise<string> {
    const config = await this.configuration();
    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: input.redirectUri,
      scope: SCOPES,
      state: input.state,
      code_challenge: await client.calculatePKCECodeChallenge(input.codeVerifier),
      code_challenge_method: "S256",
    });
    return url.toString();
  }

  async exchange(input: { callbackUrl: URL; codeVerifier: string; state: string }): Promise<GoogleProfile> {
    const config = await this.configuration();
    const tokens = await client.authorizationCodeGrant(config, input.callbackUrl, {
      pkceCodeVerifier: input.codeVerifier,
      expectedState: input.state,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims || typeof claims.email !== "string") {
      throw new Error("Google sent no ID token with an email");
    }
    return {
      sub: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true,
      name: typeof claims.name === "string" ? claims.name : claims.email,
      picture: typeof claims.picture === "string" ? claims.picture : null,
    };
  }

  private configuration(): Promise<client.Configuration> {
    if (!this.config) {
      this.config = client
        .discovery(GOOGLE_ISSUER, this.env.GOOGLE_CLIENT_ID, this.env.GOOGLE_CLIENT_SECRET)
        .catch((error: unknown) => {
          // The next login tries the discovery again.
          this.config = null;
          throw error;
        });
    }
    return this.config;
  }
}
