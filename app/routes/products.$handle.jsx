import {CartForm, Image} from '@shopify/hydrogen';
import {ShopPayButton} from '@shopify/hydrogen-react';
import {json, useLoaderData} from 'react-router';
import {Link} from 'react-router-dom';

export async function loader({params, context, request}) {
  const {handle} = params;

  const searchParams = new URL(request.url).searchParams;
  const selectedOptions = [];
  console.log('searchParams', searchParams);

  searchParams.forEach((value, name) => {
    selectedOptions.push({name, value});
  });

  console.log('selectedOptions', selectedOptions);

  const {product, shop} = await context.storefront.query(PRODUCT_QUERY, {
    variables: {
      handle, // Pass the handle to the GraphQL query
      //   selectedOptions: [{name: 'Title', value: 'Default Title'}],
      selectedOptions,
    },
  });

  if (!product?.id) {
    throw new Response(null, {status: 404});
  }

  const selectedVariant =
    product.selectedVariant ?? product?.variants?.nodes[0];

  console.log('selectedVariant', selectedVariant);
  console.log('product', product?.variants?.nodes);
  console.log('shop', shop.primaryDomain);

  if (!selectedVariant?.id) {
    throw new Response(null, {status: 404});
  }

  return json({
    shop,
    handle,
    product,
    selectedVariant,
  });
}

export default function ProductHandle() {
  const {product, selectedVariant, shop} = useLoaderData();

  return (
    <section className="w-full gap-4 md:gap-8 grid px-6 md:px-8 lg:px-12">
      <div className="grid items-start gap-6 lg:gap-20 md:grid-cols-2 lg:grid-cols-3">
        <div className="grid md:grid-flow-row  md:p-0 md:overflow-x-hidden md:grid-cols-2 md:w-full lg:col-span-2">
          <div className="md:col-span-2 snap-center card-image aspect-square md:w-full w-[80vw] shadow rounded">
            <Image src={product.featuredImage.url} />
          </div>
        </div>
        <div className="md:sticky md:mx-auto max-w-xl md:max-w-[24rem] grid gap-2 p-0 md:p-6 md:px-0 top-[6rem] lg:top-[8rem] xl:top-[10rem]">
          <div className="grid gap-2">
            <h1 className="text-4xl font-bold leading-10 whitespace-normal">
              {product.title}
            </h1>
            <span className="max-w-prose whitespace-pre-wrap inherit text-copy opacity-50 font-medium">
              {product.vendor}
            </span>
          </div>
          <div className="grid gap-4 mb-6">
            {/* Each option will show a label and option value <Links> */}
            {product.options.map((option) => {
              if (option.values.length === 1) {
                return <span key={option.name}>No option</span>;
              }
              return (
                <div
                  key={option.name}
                  className="flex flex-col flex-wrap mb-4 gap-y-2 last:mb-0"
                >
                  <h3 className="whitespace-pre-wrap max-w-prose font-bold text-lead min-w-[4rem]">
                    {option.name}
                  </h3>

                  <div className="flex flex-wrap items-baseline gap-4">
                    {option.values.map((value) => {
                      // Build a URLSearchParams object from the current search string
                      //   const linkParams = new URLSearchParams(search);
                      // Set the option name and value, overwriting any existing values
                      //   linkParams.set(option.name, value);
                      return (
                        <Link
                          key={value}
                          //   to={`${pathname}?${linkParams.toString()}`}
                          preventScrollReset
                          replace
                          className="leading-none py-1 border-b-[1.5px] cursor-pointer hover:no-underline transition-all duration-200"
                        >
                          {value}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div
            className="prose border-t border-gray-200 pt-6 text-black text-md"
            dangerouslySetInnerHTML={{__html: product.descriptionHtml}}
          ></div>
          {selectedVariant.availableForSale && (
            <ShopPayButton
              storeDomain={shop.primaryDomain.url}
              variantIds={[selectedVariant.id]}
              width={'400px'}
            />
          )}
          <CartForm
            route="/cart"
            inputs={{
              lines: [
                {
                  merchandiseId: selectedVariant.id,
                },
              ],
            }}
            action={CartForm.ACTIONS.LinesAdd}
          >
            {(fetcher) => (
              <>
                <button
                  type="submit"
                  className="border border-black rounded-sm w-full px-4 py-2 text-white bg-black uppercase hover:bg-white hover:text-black transition-colors duration-150"
                  onClick={() => {
                    window.location.href = window.location.href + '#cart-aside';
                  }}
                >
                  {selectedVariant.availableForSale
                    ? 'Add to Cart'
                    : 'Sold out'}
                </button>
              </>
            )}
          </CartForm>
        </div>
      </div>
    </section>
  );
}

const PRODUCT_QUERY = `#graphql
  query product($handle: String!, $selectedOptions: [SelectedOptionInput!]!) {
    shop{
        primaryDomain{
            url
        }
    }
    product(handle: $handle) {
      id
      title
      handle
      vendor
      description
      descriptionHtml
      featuredImage{
        id
        url
        altText
        width
        height
      }
      options {
        name,
        values
      }
      selectedVariant: variantBySelectedOptions(selectedOptions: $selectedOptions) {
        id
        selectedOptions{
            name
            value
        }
      }
      variants(first: 1){
        nodes{
            id
            price{
                currencyCode
                amount
            }
            availableForSale
        }
      }
    }
  }
`;
