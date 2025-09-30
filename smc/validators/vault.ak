use aiken/builtin
use aiken/collection/list
use aiken/option
use cardano/address.{Address, Credential, Script}
use cardano/assets.{AssetName, PolicyId}
use cardano/transaction.{Datum, Input, Output, OutputReference, Transaction}
use config

validator vault {
  spend(
    _datum: Option<Data>,
    _redeemer: Data,
    self_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(self_input) =
      self.inputs
        |> transaction.find_input(self_ref)

    let this_hash =
      when self_input.output.address.payment_credential is {
        Script(h) -> h
        _ -> fail @"invalid credential"
      }

    let nft_qty_in =
      fn(v) {
        assets.quantity_of(v, config.nft_policy_id, config.nft_asset_name)
      }

    let qty_in = nft_qty_in(self_input.output.value)

    let qty_out =
      self.outputs
        |> list.filter_map(
            fn(out) {
              when out.address.payment_credential is {
                Script(h) ->
                  if h == this_hash {
                    Some(nft_qty_in(out.value))
                  } else {
                    None
                  }
                _ -> None
              }
            },
          )
        |> list.foldr(0, fn(q, acc) { acc + q })

    qty_out >= qty_in && qty_in > 0
  }

  else(_) {
    fail
  }
}
