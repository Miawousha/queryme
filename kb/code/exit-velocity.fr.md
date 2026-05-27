---
name: "exit_velocity"
role: author
visibility: private
description: "Tunnel d'admission pseudonyme pour fondateurs explorant discrètement leurs options de sortie."
year: 2026
last_active: "2026-01"
language: "TypeScript"
code_bytes: 121412
archived: false
tags: [nextjs, react, typescript, fintech]
---

exit_velocity est un tunnel d'admission Next.js 15 qui permet aux fondateurs d'évaluer une sortie en toute confidentialité. Le parcours est strict : on saisit un email, on se voit attribuer un pseudonyme céleste (ex. « Crimson Vega ») dont l'unicité globale est garantie par une réservation en Postgres, on clique sur le lien de vérification dans les 48 heures, puis on répond à six questions dans une session chronométrée de 15 minutes — pas de brouillon, pas de re-soumission. Construit avec shadcn/ui, Vercel Postgres, Resend pour la vérification et les notifications admin, et Zustand pour le timer ; chaque soumission vérifiée déclenche une relecture manuelle par le propriétaire.
