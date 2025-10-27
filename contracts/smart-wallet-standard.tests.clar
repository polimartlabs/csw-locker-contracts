(define-constant smart-wallet-contract (as-contract tx-sender))

;; ============================================
;; PROPERTY-BASED TESTS
;; ============================================

;; Transferring the wallet correctly updates the owner and the admins map.
(define-public (test-transfer-wallet (new-owner principal))
  (if
    (or 
      (not (is-eq tx-sender (var-get owner)))
      (is-eq new-owner (var-get owner))
    )
    ;; Discard invalid inputs.
    (ok false)
    (let (
        (initial-owner (var-get owner))
      )
      ;; The initial owner should be an admin before the transfer.
      (asserts! (is-admin initial-owner) (err u995))
      ;; The transfer is executed.
      (try! (transfer-wallet new-owner))
      ;; The owner should be updated to the new owner.
      (asserts! (is-eq (var-get owner) new-owner) (err u996))
      ;; The initial owner should no longer be an admin.
      (asserts! (not (is-admin initial-owner)) (err u997))
      ;; The new owner should be an admin.
      (asserts! (is-admin new-owner) (err u998))
      ;; The contract itself should always be an admin.
      (asserts! (is-admin smart-wallet-contract) (err u999))
      (ok true)
    )
  )
)

;; Calling stx-transfer correctly updates the parties' balances.
(define-public (test-stx-transfer-balances
    (amount uint)
    (recipient principal)
    (memo (optional (buff 34)))
  )
  (let (
      (smart-wallet-owner (var-get owner))
      (smart-wallet-balance-before (stx-get-balance smart-wallet-contract))
      (recipient-balance-before (stx-get-balance recipient))
    )
    (if
      (or
        (is-eq amount u0)
        (< smart-wallet-balance-before amount)
        (not (is-eq tx-sender smart-wallet-owner))
      )
      ;; Discard invalid inputs.
      (ok false)
      (begin
        (try! (stx-transfer amount recipient memo))
        (asserts!
          (is-eq
            (stx-get-balance smart-wallet-contract)
            (- smart-wallet-balance-before amount)
          )
          (err u998)
        )
        (asserts!
          (is-eq
            (stx-get-balance recipient)
            (+ recipient-balance-before amount)
          )
          (err u999)
        )
        (ok true)
      )
    )
  )
)

;; Calling ext-sponsored-transfer correctly updates the parties' balances.
(define-public (test-sponsored-stx-extension-transfer-balances
    (amount uint)
    (recipient principal)
    (fees uint)
  )
  (let (
      (smart-wallet-balance-before (stx-get-balance smart-wallet-contract))
      (recipient-balance-before (stx-get-balance recipient))
    )
    (if
      (or
        (is-eq amount u0)
        (< smart-wallet-balance-before amount)
        (not (is-eq tx-sender (var-get owner)))
      )
      ;; Discard invalid inputs.
      (ok false)
      (begin
        (try! (ext-sponsored-stx-transfer amount recipient fees))
        (asserts!
          (is-eq
            (stx-get-balance smart-wallet-contract)
            (- smart-wallet-balance-before amount)
          )
          (err u998)
        )
        (asserts!
          (is-eq
            (stx-get-balance recipient)
            (+ recipient-balance-before amount)
          )
          (err u999)
        )
        (ok true)
      )
    )
  )
)

;; Calling ext-sponsored-sbtc-transfer correctly updates the parties' balances.
(define-public (test-sponsored-sbtc-extension-transfer-balances
    (amount uint)
    (recipient principal)
    (fees uint)
  )
  (let (
      (smart-wallet-balance-before (sbtc-get-balance smart-wallet-contract))
      (recipient-balance-before (sbtc-get-balance recipient))
    )
    (if
      (or
        (is-eq amount u0)
        (< smart-wallet-balance-before amount)
        (not (is-eq tx-sender (var-get owner)))
      )
      ;; Discard invalid inputs.
      (ok false)
      (let (
          (payload (unwrap-panic (to-consensus-buff? {
            amount: amount,
            to: recipient,
            fees: fees,
          })))
        )
        (try! (extension-call .ext-sponsored-sbtc-transfer payload))
        (asserts!
          (is-eq
            (sbtc-get-balance smart-wallet-contract)
            (- smart-wallet-balance-before amount)
          )
          (err u998)
        )
        (asserts!
          (is-eq
            (sbtc-get-balance recipient)
            (+ recipient-balance-before amount)
          )
          (err u999)
        )
        (ok true)
      )
    )
  )
)

;; The extension should own the delegated funds after the delegation is
;; successful. If the delegation is successful, the extension should be marked
;; as delegated in PoX depending on the burn height deadline value.
(define-public (test-delegate-extension-delegate
    (amount uint)
    (to principal)
    (until-burn-ht (optional uint))
  )
  (let (
      (smart-wallet-balance-before (stx-get-balance smart-wallet-contract))
      (extension-balance-before (stx-get-balance .ext-delegate-stx-pox-4))
    )
    (if
      (or
        (not (is-eq tx-sender (var-get owner)))
        (is-eq amount u0)
        (< smart-wallet-balance-before amount)
        (already-delegated .ext-delegate-stx-pox-4)
      )
      ;; Discard invalid inputs.
      (ok false)
      (begin
        (try! (delegate-stx-pox-4 amount to until-burn-ht none))
        ;; The extension should be marked as delegated in PoX if the value of
        ;; until-burn-ht is some and is greater than or equal to the burn block
        ;; height, or if until-burn-ht is none.
        (match until-burn-ht
          some-burn-ht
            (if
              (<= burn-block-height some-burn-ht)
              (asserts! (already-delegated .ext-delegate-stx-pox-4) (err u995))
              (asserts!
                (not (already-delegated .ext-delegate-stx-pox-4))
                (err u996)
              )
            )
          (asserts! (already-delegated .ext-delegate-stx-pox-4) (err u997))
        )
        ;; The smart wallet's should have sent the funds to the extension.
        (asserts!
          (is-eq
            (stx-get-balance smart-wallet-contract)
            (- smart-wallet-balance-before amount)
          )
          (err u998)
        )
        ;; The extension should have received the funds.
        (asserts!
          (is-eq
            (stx-get-balance .ext-delegate-stx-pox-4)
            (+ extension-balance-before amount)
          )
          (err u999)
        )
        (var-set delegate-extension-funds (+ (var-get delegate-extension-funds) amount))
        (ok true)
      )
    )
  )
)

;; Revoking the delegation correctly updates the delegation state.
(define-public (test-delegate-extension-revoke)
  (if
    (or
      (not (is-eq tx-sender (var-get owner)))
      (not (already-delegated .ext-delegate-stx-pox-4))
    )
    (ok false)
    (begin
      (try! (revoke-delegate-stx-pox-4))
      ;; The extension should be marked as not delegated in PoX.
      (asserts! (not (already-delegated .ext-delegate-stx-pox-4)) (err u999))
      (ok true)
    )
  )
)

;; Refunding the delegation correctly updates the parties' balances.
(define-public (test-delegate-extension-refund)
  (let (
      (smart-wallet-balance-before (stx-get-balance smart-wallet-contract))
      (extension-balance-before (stx-get-balance .ext-delegate-stx-pox-4))
    )
    (if
      (or
        (not (is-eq tx-sender (var-get owner)))
        (is-eq (var-get delegate-extension-funds) u0)
      )
      ;; Discard invalid inputs.
      (ok false)
      (begin
        (try! (refund-delegate-extension))
        ;; The extension should have sent the funds to the smart wallet.
        (asserts!
          (is-eq
            (stx-get-balance .ext-delegate-stx-pox-4)
            (- extension-balance-before (var-get delegate-extension-funds))
          )
          (err (stx-get-balance .ext-delegate-stx-pox-4))
        )
        ;; The smart wallet should have received the funds.
        (asserts!
          (is-eq
            (stx-get-balance smart-wallet-contract)
            (+ smart-wallet-balance-before (var-get delegate-extension-funds))
          )
          (err (stx-get-balance smart-wallet-contract))
        )
        (var-set delegate-extension-funds u0)
        (ok true)
      )
    )
  )
)

;; ============================================
;; PROPERTY-BASED TESTING HELPERS
;; ============================================
;; These helpers are not checking anything, they are just used to trigger the
;; funding of the wallet during property-based testing runs and keep track of
;; useful data.

(define-data-var delegate-extension-funds uint u0)

(define-public (test-fund-wallet-stx-helper (amount uint))
  (let (
      (funding-result (fund-wallet-stx amount))
    )
    (if
      (is-err funding-result)
      (ok false)
      (ok true)
    )
  )
)

(define-public (test-fund-wallet-sbtc-helper (amount uint))
  (let (
      (funding-result (fund-wallet-sbtc amount))
    )
    (if
      (is-err funding-result)
      (ok false)
      (ok true)
    )
  )
)

;; ============================================
;; INVARIANTS
;; ============================================

;; The current owner is always an admin.
(define-read-only (invariant-current-owner-is-admin)
  (is-admin (var-get owner))
)

;; The contract itself is always an admin.
(define-read-only (invariant-contract-is-admin)
  (is-admin smart-wallet-contract)
)

;; The wallet's STX balance should be 0 before funding.
(define-read-only (invariant-initial-wallet-stx-balance)
  (let (
      (num-passed-stx-fund-calls
        (default-to u0
          (get called (map-get? context "fund-wallet-stx-helper"))
        )
      )
    )
    (or
      (> num-passed-stx-fund-calls u0)
      (is-eq (stx-get-balance smart-wallet-contract) u0)
    )
  )
)

;; The wallet's sBTC balance should be 0 before funding.
(define-read-only (invariant-initial-wallet-sbtc-balance)
  (let (
      (num-passed-sbtc-fund-calls
        (default-to u0
          (get called (map-get? context "fund-wallet-sbtc-helper"))
        )
      )
    )
    (or
      (> num-passed-sbtc-fund-calls u0)
      (is-eq (sbtc-get-balance smart-wallet-contract) u0)
    )
  )
)

;; The successful stx-transfer/ext-sponsored-stx-transfer calls count is always
;; 0 if the wallet has not been funded with STX.
(define-read-only (invariant-successful-stx-transfer-calls-count)
  (let (
      (num-passed-stx-fund-calls
        (default-to u0
          (get called (map-get? context "fund-wallet-stx-helper"))
        )
      )
      (num-passed-stx-transfer-calls
        (default-to u0 (get called (map-get? context "stx-transfer")))
      )
      (num-passed-ext-sponsored-stx-transfer-calls
        (default-to u0
          (get called (map-get? context "ext-sponsored-stx-transfer-helper"))
        )
      )
    )
    (or
      (> num-passed-stx-fund-calls u0)
      (is-eq
        (+
          num-passed-stx-transfer-calls
          num-passed-ext-sponsored-stx-transfer-calls
        )
        u0
      )
    )
  )
)

;; The successful ext-sponsored-sbtc-transfer calls count is always 0 if the
;; wallet has not been funded with sBTC.
(define-read-only (invariant-successful-sbtc-transfer-calls-count)
  (let (
      (num-passed-sbtc-fund-calls
        (default-to u0
          (get called (map-get? context "fund-wallet-sbtc-helper"))
        )
      )
      (num-passed-ext-sponsored-sbtc-transfer-calls
        (default-to u0
          (get called (map-get? context "ext-sponsored-sbtc-transfer-helper"))
        )
      )
    )
    (or
      (> num-passed-sbtc-fund-calls u0)
      (is-eq num-passed-ext-sponsored-sbtc-transfer-calls u0)
    )
  )
)

;; If the wallet was funded but no stx-transfer/ext-sponsored-stx-transfer
;; calls were successful, the wallet's STX balance should be greater than 0.
(define-read-only (invariant-funded-wallet-stx-balance)
  (let (
      (num-passed-stx-fund-calls
        (default-to u0
          (get called (map-get? context "fund-wallet-stx-helper"))
        )
      )
      (num-passed-stx-transfer-calls
        (default-to u0 (get called (map-get? context "stx-transfer")))
      )
      (num-passed-ext-sponsored-stx-transfer-calls
        (default-to u0
          (get called (map-get? context "ext-sponsored-stx-transfer-helper"))
        )
      )
    )
    (if
      (or
        (is-eq num-passed-stx-fund-calls u0)
        (not
          (is-eq
            (+
              num-passed-stx-transfer-calls
              num-passed-ext-sponsored-stx-transfer-calls
            )
            u0
          )
        )
      )
      ;; The state is not suitable for this invariant, return true.
      true
      (> (stx-get-balance smart-wallet-contract) u0)
    )
  )
)

;; The number of delegate calls should be greater than or equal to the number
;; of revoke calls. This ensures that no extra revoke calls are made if all the
;; delegations have been revoked.
(define-read-only (invariant-delegation-calls-count)
  (let (
    (num-delegate
      (default-to u0
        (get called (map-get? context "delegate-stx-pox-4-helper"))
      )
    )
    (num-revoke
      (default-to u0
        (get called (map-get? context "revoke-delegate-stx-pox-4-helper"))
      )
    )
  )
    (>= num-delegate num-revoke)
  )
)

;; If all the delegations have been revoked, the extension should be marked as
;; not delegated in PoX.
(define-read-only (invariant-active-delegation)
  (let (
    (num-delegate
      (default-to u0
        (get called (map-get? context "delegate-stx-pox-4-helper"))
      )
    )
    (num-revoke
      (default-to u0
        (get called (map-get? context "revoke-delegate-stx-pox-4-helper"))
      )
    )
  )
    (if
      (not (is-eq num-delegate num-revoke))
      true
      ;; All the delegations have been revoked.
      (not (already-delegated .ext-delegate-stx-pox-4))
    )
  )
)

;; ============================================
;; INVARIANT TESTING HELPERS
;; ============================================
;; These helper functions are not part of the main contract but serve two
;; purposes during invariant testing:
;; - Fund the wallet with STX and sBTC
;; - Create wrappers for extension calls, since generating valid buffers
;;   requires knowing the payload structure before serialization
;;   (structure-aware fuzzing)

(define-data-var last-delegation-until-burn-ht (optional uint) none)

;; Attempts to fund the wallet with STX.
(define-public (fund-wallet-stx-helper (amount uint))
  (fund-wallet-stx amount)
)

;; Attempts to fund the wallet with sBTC.
(define-public (fund-wallet-sbtc-helper (amount uint))
  (fund-wallet-sbtc amount)
)

;; Attempts to call the ext-sponsored-stx-transfer extension.
(define-public (ext-sponsored-stx-transfer-helper
    (amount uint)
    (recipient principal)
    (fees uint)
  )
  (ext-sponsored-stx-transfer amount recipient fees)
)

;; Attempts to call the ext-sponsored-sbtc-transfer extension.
(define-public (ext-sponsored-sbtc-transfer-helper
    (amount uint)
    (recipient principal)
    (fees uint)
  )
  (ext-sponsored-sbtc-transfer amount recipient fees)
)

;; Attempts to call the delegate-stx-pox-4 extension. Uses none for burn height
;; deadline to enable delegation state checking over time, since pox-4 does not
;; expose a method to check the delegation-state map directly.
(define-public (delegate-stx-pox-4-helper
    (amount uint)
    (to principal)
    (until-burn-ht (optional uint))
  )
  (begin
    (try! (delegate-stx-pox-4 amount to until-burn-ht none))
    (var-set last-delegation-until-burn-ht until-burn-ht)
    (ok true)
  )
)

;; Attempts to call the revoke-delegate-stx-pox-4 extension.
(define-public (revoke-delegate-stx-pox-4-helper)
  (revoke-delegate-stx-pox-4)
)

;; ============================================
;; SHARED HELPERS
;; ============================================

;; Helper to fund the wallet with STX.
(define-private (fund-wallet-stx (amount uint))
  (stx-transfer? amount tx-sender smart-wallet-contract)
)

;; Helper to fund the wallet with sBTC.
(define-private (fund-wallet-sbtc (amount uint))
  (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer
    amount tx-sender smart-wallet-contract none
  )
)

;; Helper to call the ext-sponsored-stx-transfer extension.
(define-private (ext-sponsored-stx-transfer
    (amount uint)
    (recipient principal)
    (fees uint)
  )
  (extension-call
    .ext-sponsored-transfer
    (unwrap-panic
      (to-consensus-buff?
        {
          amount: amount,
          to: recipient,
          fees: fees,
        }
      )
    )
  )
)

;; ext-sponsored-sbtc-transfer extension call wrapper.
(define-private (ext-sponsored-sbtc-transfer
    (amount uint)
    (recipient principal)
    (fees uint)
  )
  (extension-call
    .ext-sponsored-sbtc-transfer
    (unwrap-panic
      (to-consensus-buff?
        {
          amount: amount,
          to: recipient,
          fees: fees,
        }
      )
    )
  )
)

;; ext-delegate-stx-pox-4 extension delegate call wrapper.
(define-private (delegate-stx-pox-4
    (amount uint)
    (to principal)
    (until-burn-ht (optional uint))
    (pox-addr
      (optional
        {
          version: (buff 1),
          hashbytes: (buff 32),
        }
      )
    )
  )
  (extension-call
    .ext-delegate-stx-pox-4
    (unwrap-panic
      (to-consensus-buff? {
        action: "delegate",
        amount-ustx: amount,
        delegate-to: to,
        until-burn-ht: until-burn-ht,
        pox-addr: pox-addr,
      })
    )
  )
)

;; ext-delegate-stx-pox-4 extension revoke call wrapper.
(define-private (revoke-delegate-stx-pox-4)
  (extension-call
    .ext-delegate-stx-pox-4
    (unwrap-panic (to-consensus-buff? {
      action: "revoke",
      amount-ustx: u0,
      delegate-to: tx-sender,
      until-burn-ht: none,
      pox-addr: none,
    }))
  )
)

;; ext-delegate-stx-pox-4 extension refund call wrapper.
(define-private (refund-delegate-extension)
  (extension-call
    .ext-delegate-stx-pox-4
    (unwrap-panic (to-consensus-buff? {
      action: "",
      amount-ustx: u0,
      delegate-to: tx-sender,
      until-burn-ht: none,
      pox-addr: none,
    }))
  )
)

(define-read-only (sbtc-get-balance (who principal))
  (unwrap-panic
    (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
      get-balance who
    )
  )
)

(define-read-only (is-admin (who principal))
  (default-to false (map-get? admins who))
)

(define-read-only (already-delegated (who principal))
  (is-some
    (contract-call? 'SP000000000000000000002Q6VF78.pox-4
      get-check-delegation who
    )
  )
)