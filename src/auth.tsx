import { supabase } from './supabase'

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'https://getcited.space'
    }
  })
  if (error) console.error(error)
}

export async function signOut() {
  await supabase.auth.signOut()
}
