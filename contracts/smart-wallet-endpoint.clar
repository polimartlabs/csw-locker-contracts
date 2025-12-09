;; title: smart-wallet-endpoint
;; version:
;; summary:
;; description:
(define-constant err-invalid-payload (err u5000))
(use-trait sip-010-token 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)
(use-trait wallet-trait .smart-wallet-trait.smart-wallet-trait)
(use-trait extension-trait 'ST3FFRX7C911PZP5RHE148YDVDD9JWVS6FZRA60VS.extension-trait.extension-trait)

(define-public (stx-transfer-sponsored
    (sm <wallet-trait>)
    (details {
      amount: uint,
      to: principal,
      fees: uint,
    })
    (sig-auth (optional {
      auth-id: uint,
      signature: (buff 64),
      pubkey: (buff 33),
    }))
  )
  (contract-call? sm extension-call .ext-sponsored-transfer
    (unwrap! (to-consensus-buff? details) err-invalid-payload) sig-auth
  )
)

(define-public (stx-send-many-sponsored
    (sm <wallet-trait>)
    (details {
      recipients: (list 11 {
        ustx: uint,
        to: principal,
      }),
      fees: uint,
    })
    (sig-auth (optional {
      auth-id: uint,
      signature: (buff 64),
      pubkey: (buff 33),
    }))
  )
  (contract-call? sm extension-call .ext-sponsored-send-many
    (unwrap! (to-consensus-buff? details) err-invalid-payload) sig-auth
  )
)

(define-public (sbtc-transfer-sponsored
    (sm <wallet-trait>)
    (details {
      amount: uint,
      to: principal,
      fees: uint,
    })
    (sig-auth (optional {
      auth-id: uint,
      signature: (buff 64),
      pubkey: (buff 33),
    }))
  )
  (contract-call? sm extension-call .ext-sponsored-sbtc-transfer
    (unwrap! (to-consensus-buff? details) err-invalid-payload) sig-auth
  )
)

(define-public (sbtc-transfer-many-sponsored
    (sm <wallet-trait>)
    (details {
      recipients: (list
        11
        {
          ;; Amount in sats.
          a: uint,
          ;; Recipient address.
          r: principal,
        }
      ),
      fees: uint,
    })
    (sig-auth (optional {
      auth-id: uint,
      signature: (buff 64),
      pubkey: (buff 33),
    }))
  )
  (contract-call? sm extension-call .ext-sponsored-sbtc-transfer-many
    (unwrap! (to-consensus-buff? details) err-invalid-payload) sig-auth
  )
)

(define-public (delegate-stx
    (sm <wallet-trait>)
    (extension <extension-trait>)
    (amount uint)
    (to principal)
    (sig-auth (optional {
      auth-id: uint,
      signature: (buff 64),
      pubkey: (buff 33),
    }))
  )
  (contract-call? sm extension-call extension
    (unwrap!
      (to-consensus-buff? {
        action: "delegate",
        amount-ustx: amount,
        delegate-to: to,
        until-burn-ht: none,
        pox-addr: none,
      })
      err-invalid-payload
    )
    sig-auth
  )
)

(define-public (revoke-delegate-stx
    (sm <wallet-trait>)
    (extension <extension-trait>)
    (sig-auth (optional {
      auth-id: uint,
      signature: (buff 64),
      pubkey: (buff 33),
    }))
  )
  (contract-call? sm extension-call extension
    (unwrap!
      (to-consensus-buff? {
        action: "revoke",
        amount-ustx: u0,
        delegate-to: tx-sender,
        until-burn-ht: none,
        pox-addr: none,
      })
      err-invalid-payload
    )
    sig-auth
  )
)
