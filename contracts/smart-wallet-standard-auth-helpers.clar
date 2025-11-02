;; TODO: Check if needed.
(define-constant SIP018_MSG_PREFIX 0x534950303138)

(define-read-only (build-stx-transfer-hash
    (auth-id uint)
    (amount uint)
    (recipient principal)
    (memo (optional (buff 34)))
  )
  (hash-message {
    topic: "stx-transfer",
    auth-id: auth-id,
    amount: (some amount),
    extension: none,
    memo: memo,
    new-admin: none,
    nft-id: none,
    payload: none,
    pubkey: none,
    recipient: (some recipient),
    sip009: none,
    sip010: none,
  })
)

(define-read-only (build-extension-call-hash
    (auth-id uint)
    (extension principal)
    (payload (buff 2048))
  )
  (hash-message {
    topic: "extension-call",
    auth-id: auth-id,
    amount: none,
    extension: (some extension),
    memo: none,
    new-admin: none,
    nft-id: none,
    payload: (some payload),
    pubkey: none,
    recipient: none,
    sip009: none,
    sip010: none,
  })
)

(define-read-only (build-sip010-transfer-hash
    (auth-id uint)
    (amount uint)
    (recipient principal)
    (memo (optional (buff 34)))
    (sip010 principal)
  )
  (hash-message {
    topic: "sip010-transfer",
    auth-id: auth-id,
    amount: (some amount),
    extension: none,
    memo: memo,
    new-admin: none,
    nft-id: none,
    payload: none,
    pubkey: none,
    recipient: (some recipient),
    sip009: none,
    sip010: (some sip010),
  })
)

(define-read-only (build-sip009-transfer-hash
    (auth-id uint)
    (nft-id uint)
    (recipient principal)
    (sip009 principal)
  )
  (hash-message {
    topic: "sip009-transfer",
    auth-id: auth-id,
    amount: none,
    extension: none,
    memo: none,
    new-admin: none,
    nft-id: (some nft-id),
    payload: none,
    pubkey: none,
    recipient: (some recipient),
    sip009: (some sip009),
    sip010: none,
  })
)

(define-read-only (build-transfer-wallet-hash
    (auth-id uint)
    (new-admin principal)
  )
  (hash-message {
    topic: "transfer-wallet",
    auth-id: auth-id,
    amount: none,
    extension: none,
    memo: none,
    new-admin: (some new-admin),
    nft-id: none,
    payload: none,
    pubkey: none,
    recipient: none,
    sip009: none,
    sip010: none,
  })
)

(define-read-only (hash-message (message-tuple {
  topic: (string-ascii 32),
  auth-id: uint,
  amount: (optional uint),
  extension: (optional principal),
  memo: (optional (buff 34)),
  new-admin: (optional principal),
  nft-id: (optional uint),
  payload: (optional (buff 2048)),
  pubkey: (optional (buff 33)),
  recipient: (optional principal),
  sip009: (optional principal),
  sip010: (optional principal),
}))
  (sha256 (concat SIP018_MSG_PREFIX
    (concat
      (sha256 (unwrap-panic (to-consensus-buff? {
        name: "smart-wallet-standard",
        version: "1.0.0",
        chain-id: chain-id,
      })))
      (sha256 (unwrap-panic (to-consensus-buff? message-tuple)))
    )))
)
