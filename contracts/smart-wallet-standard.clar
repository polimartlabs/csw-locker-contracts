;; title: smart-wallet-standard
;; version: 1
;; summary: Extendible single-owner smart wallet with standard SIP-010 and SIP-009 support

;; Using deployer address for testing.
(use-trait extension-trait 'ST3FFRX7C911PZP5RHE148YDVDD9JWVS6FZRA60VS.extension-trait.extension-trait)

(use-trait sip-010-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)
(use-trait sip-009-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)

(define-constant err-unauthorised (err u4001))
(define-constant err-invalid-signature (err u4002))
(define-constant err-forbidden (err u4003))
(define-constant err-no-pubkey (err u4004))
(define-constant err-already-used (err u4005))
(define-constant err-no-auth-id (err u4006))
(define-constant err-no-message-hash (err u4007))
(define-constant err-fatal-owner-not-admin (err u9999))

(define-data-var owner principal tx-sender)

(define-fungible-token ect)

(define-map used-pubkey-authorizations
  (buff 32) ;; SIP-018 message hash
  (buff 33) ;; pubkey that signed the message
)

;; Authentication
(define-public (is-authorized (sig-message-auth (optional {
  message-hash: (buff 32),
  signature: (buff 64),
})))
  (match sig-message-auth
    sig-message-details (consume-signature (get message-hash sig-message-details)
      (get signature sig-message-details)
    )
    (is-admin-calling)
  )
)

(define-read-only (is-admin-calling)
  (ok (asserts! (is-some (map-get? admins tx-sender)) err-unauthorised))
)

;;
;; calls with context switching
;;
(define-public (stx-transfer
    (amount uint)
    (recipient principal)
    (memo (optional (buff 34)))
    (sig-auth (optional {
      auth-id: uint,
      signature: (buff 64),
    }))
  )
  (begin
    (match sig-auth
      sig-auth-details (try! (is-authorized (some {
        message-hash: (contract-call? .smart-wallet-standard-auth-helpers
          build-stx-transfer-hash {
          auth-id: (get auth-id sig-auth-details),
          amount: amount,
          recipient: recipient,
          memo: memo,
        }),
        signature: (get signature sig-auth-details),
      })))
      (try! (is-authorized none))
    )
    (print {
      a: "stx-transfer",
      payload: {
        amount: amount,
        recipient: recipient,
        memo: memo,
      },
    })
    (as-contract (match memo
      to-print (stx-transfer-memo? amount tx-sender recipient to-print)
      (stx-transfer? amount tx-sender recipient)
    ))
  )
)

(define-public (extension-call
    (extension <extension-trait>)
    (payload (buff 2048))
    (sig-auth (optional {
      auth-id: uint,
      signature: (buff 64),
    }))
  )
  (begin
    (match sig-auth
      sig-auth-details (try! (is-authorized (some {
        message-hash: (contract-call? .smart-wallet-standard-auth-helpers
          build-extension-call-hash {
          auth-id: (get auth-id sig-auth-details),
          extension: (contract-of extension),
          payload: payload,
        }),
        signature: (get signature sig-auth-details),
      })))
      (try! (is-authorized none))
    )
    (try! (ft-mint? ect u1 (as-contract tx-sender)))
    (try! (ft-burn? ect u1 (as-contract tx-sender)))
    (print {
      a: "extension-call",
      payload: {
        extension: extension,
        payload: payload,
      },
    })
    (as-contract (contract-call? extension call payload))
  )
)

;;
;; calls without context switching
;;

(define-public (sip010-transfer
    (amount uint)
    (recipient principal)
    (memo (optional (buff 34)))
    (sip010 <sip-010-trait>)
    (sig-auth (optional {
      auth-id: uint,
      signature: (buff 64),
    }))
  )
  (begin
    (match sig-auth
      sig-auth-details (try! (is-authorized (some {
        message-hash: (contract-call? .smart-wallet-standard-auth-helpers
          build-sip010-transfer-hash {
          auth-id: (get auth-id sig-auth-details),
          amount: amount,
          recipient: recipient,
          memo: memo,
          sip010: (contract-of sip010),
        }),
        signature: (get signature sig-auth-details),
      })))
      (try! (is-authorized none))
    )
    (print {
      a: "sip010-transfer",
      payload: {
        amount: amount,
        recipient: recipient,
        memo: memo,
        sip010: sip010,
      },
    })
    (contract-call? sip010 transfer amount (as-contract tx-sender) recipient memo)
  )
)

(define-public (sip009-transfer
    (nft-id uint)
    (recipient principal)
    (sip009 <sip-009-trait>)
    (sig-auth (optional {
      auth-id: uint,
      signature: (buff 64),
    }))
  )
  (begin
    (match sig-auth
      sig-auth-details (try! (is-authorized (some {
        message-hash: (contract-call? .smart-wallet-standard-auth-helpers
          build-sip009-transfer-hash {
          auth-id: (get auth-id sig-auth-details),
          nft-id: nft-id,
          recipient: recipient,
          sip009: (contract-of sip009),
        }),
        signature: (get signature sig-auth-details),
      })))
      (try! (is-authorized none))
    )
    (print {
      a: "sip009-transfer",
      payload: {
        nft-id: nft-id,
        recipient: recipient,
        sip009: sip009,
      },
    })
    (contract-call? sip009 transfer nft-id (as-contract tx-sender) recipient)
  )
)

;;
;; admin functions
;;
(define-map admins
  principal
  ;; The public key explicitly allowed by the admin to use for authentication.
  (optional (buff 33))
)

(define-public (transfer-wallet (new-admin principal))
  (begin
    ;; Only allow the admin to transfer the wallet. Signature authentication is
    ;; disabled.
    (try! (is-authorized none none))
    (asserts! (not (is-eq new-admin tx-sender)) err-forbidden)
    (try! (ft-mint? ect u1 (as-contract tx-sender)))
    (try! (ft-burn? ect u1 (as-contract tx-sender)))
    (map-set admins new-admin none)
    (map-delete admins tx-sender)
    (var-set owner new-admin)
    (print {
      a: "transfer-wallet",
      payload: { new-admin: new-admin },
    })
    (ok true)
  )
)

;; Admin can use this to set or update their public key for future
;; authentication using secp256r1 elliptic curve signature.
(define-public (update-admin-pubkey (pubkey (buff 33)))
  (begin
    ;; Only allow the admin to update their own public key. Signature
    ;; authentication is disabled.
    (try! (is-authorized none none))
    (ok (map-set admins tx-sender (some pubkey)))
  )
)

;; Secp256r1 elliptic curve signature authentication

;; Verify a signature against the current owner's registered pubkey.
;; Returns the pubkey that signed the message if verification succeeds.
(define-read-only (verify-signature
    (message-hash (buff 32))
    (signature (buff 64))
  )
  (let ((admin-pubkey (unwrap!
      (unwrap! (map-get? admins (var-get owner)) err-fatal-owner-not-admin)
      err-no-pubkey
    )))
    ;; TODO: Update to r1 when testable.
    (asserts! (secp256k1-verify message-hash signature admin-pubkey)
      err-invalid-signature
    )
    (ok admin-pubkey)
  )
)

;; Consume a signature for replay protection.
;; Verifies the signature and marks the message hash as used.
(define-public (consume-signature
    (message-hash (buff 32))
    (signature (buff 64))
  )
  (let ((signer-pubkey (try! (verify-signature message-hash signature))))
    (asserts! (is-none (map-get? used-pubkey-authorizations message-hash))
      err-already-used
    )
    (map-set used-pubkey-authorizations message-hash signer-pubkey)
    (ok true)
  )
)

(define-read-only (get-owner)
  (ok (var-get owner))
)

;; init
(map-set admins tx-sender none)
(map-set admins (as-contract tx-sender) none)
