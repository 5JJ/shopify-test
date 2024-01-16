import {ActionArgs, redirect} from '@shopify/remix-oxygen';

async function generateRandomString() {
  const timestamp = Date.now().toString();
  const randomString = Math.random().toString(36).substring(2);
  return timestamp + randomString;
}

export async function action({request, context}: ActionArgs) {
  const clientId = context.env.PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID;

  // for development
  //const requestUrl = 'https://2afc-58-76-170-103.ngrok-free.app';
  const origin = new URL(request.url).origin; // In development this would resolve to the tunneled host or an Oxygen generated host
  const loginUrl = new URL(
    `${context.env.PUBLIC_CUSTOMER_ACCOUNT_API_URL}/auth/oauth/authorize`,
  ); // Authorize Endpoint goes here

  const state = await generateRandomString();
  const nonce = await generateRandomString();

  loginUrl.searchParams.append('state', state);
  loginUrl.searchParams.append('nonce', nonce);

  loginUrl.searchParams.set('client_id', clientId);
  loginUrl.searchParams.append('response_type', 'code');
  loginUrl.searchParams.append('redirect_uri', origin + '/authorize');

  loginUrl.searchParams.set(
    'scope',
    'openid email https://api.customers.com/auth/customer.graphql',
  );

  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  context.session.set('code-verifier', verifier);

  loginUrl.searchParams.append('code_challenge', challenge);
  loginUrl.searchParams.append('code_challenge_method', 'S256');

  const redirectHeaders = new Headers();
  redirectHeaders.append('Set-Cookie', await context.session.commit());

  return redirect(loginUrl.toString(), {
    headers: redirectHeaders,
  });
}

function getNonce(token: string) {
  return decodeJwt(token).payload.nonce;
}

function decodeJwt(token: string) {
  const [header, payload, signature] = token.split('.');

  const decodedHeader = JSON.parse(atob(header));
  const decodedPayload = JSON.parse(atob(payload));

  return {
    header: decodedHeader,
    payload: decodedPayload,
    signature,
  };
}

export async function generateCodeVerifier() {
  const randomCode = generateRandomCode();
  return base64UrlEncode(randomCode);
}

export async function generateCodeChallenge(codeVerifier: string) {
  const digestOp = await crypto.subtle.digest(
    {name: 'SHA-256'},
    new TextEncoder().encode(codeVerifier),
  );
  const hash = convertBufferToString(digestOp);
  return base64UrlEncode(hash);
}

function generateRandomCode() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return String.fromCharCode.apply(null, Array.from(array));
}

function base64UrlEncode(str) {
  const base64 = btoa(str);
  // This is to ensure that the encoding does not have +, /, or = characters in it.
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function convertBufferToString(hash) {
  const uintArray = new Uint8Array(hash);
  const numberArray = Array.from(uintArray);
  return String.fromCharCode(...numberArray);
}

export async function loader({request, context}) {
  const code = new URL(request.url).searchParams.get('code');
  const state = new URL(request.url).searchParams.get('state');

  if (!code) throw new Response('No Code', {status: 400});
  // if (state !== context.session.get('state'))
  //   throw new Response('State does not match', {status: 400});

  const clientId = context.env.PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID;
  const customerAccountApiUrl = context.env.PUBLIC_CUSTOMER_ACCOUNT_API_URL;

  // In a development environment, the origin of a tunneled host has an http protocol. Only the https protocol is supported for origin, logout and callback URIs. To ensure the storefront origin is always using the https protocol, check for http and replace it with https.
  const url = new URL(request.url);
  const origin =
    url.protocol === 'http:' ? url.origin.replace('http', 'https') : url.origin;

  const body = new URLSearchParams();

  body.append('grant_type', 'authorization_code');
  body.append('client_id', clientId);
  body.append('redirect_uri', `${origin}/authorize`);
  body.append('code', code);

  const codeVerifier = context.session.get('code-verifier');
  body.append('code_verifier', codeVerifier);

  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.93 Safari/537.36';

  const headers = new Headers();
  headers.append('Content-Type', 'application/x-www-form-urlencoded');
  headers.append('User-Agent', userAgent);
  headers.append('Origin', origin);

  // Token endpoint
  const tokenRequestUrl = `${customerAccountApiUrl}/auth/oauth/token`;

  const response = await fetch(tokenRequestUrl, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const responseHeaders = new Headers();
    responseHeaders.append('Content-Type', 'text/html; charset=utf-8');
    throw new Response(await response.text(), {
      status: response.status,
      headers: responseHeaders,
    });
  }

  const {access_token, expires_in, id_token, refresh_token} =
    await response.json();

  const nonce = getNonce(id_token);

  if (nonce !== context.session.get('nonce'))
    throw new Response('Nonce does not match', {status: 400});

  context.session.set('customer_authorization_code_token', access_token);
  context.session.set('expires_in', expires_in);
  context.session.set('id_token', id_token);
  context.session.set('refresh_token', refresh_token);

  const redirectHeaders = new Headers();
  redirectHeaders.append('Set-Cookie', await context.session.commit());
  return redirect('/', {
    headers: redirectHeaders,
  });
}
