;; title: ext-sbtc-transfer-many
;; version: 1.0
;; summary: Transfers SBTC tokens to many recipients
;; description:

(define-constant err-invalid-payload (err u500))

(define-private (send-many (recipients (list 200 {
  ustx: uint,
  to: principal,
})))
  (contract-call? 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.send-many send-many recipients)
)

(define-public (call (payload (buff 2048)))
  (let ((details (unwrap!
      (from-consensus-buff? {
        recipients: (list
          200
          {
            ustx: uint,
            to: principal,
          }
        ),
        fees: uint,
      }
        payload
      )
      err-invalid-payload
    )))
    (try! (send-many (get recipients details)))
    (match tx-sponsor?
      spnsr (try! (stx-transfer? (get fees details) tx-sender spnsr))
      true
    )
    (ok true)
  )
)
