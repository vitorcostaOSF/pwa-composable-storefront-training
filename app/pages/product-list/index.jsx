/*
 * Copyright (c) 2022, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import React, {useEffect, useState} from 'react'
import PropTypes from 'prop-types'
import {useHistory, useParams} from 'react-router-dom'
import {FormattedMessage, useIntl} from 'react-intl'
import {Helmet} from 'react-helmet'

// Components
import {
    Box,
    Flex,
    SimpleGrid,
    Grid,
    Select,
    Text,
    FormControl,
    Stack,
    useDisclosure,
    Button,
    Modal,
    ModalHeader,
    ModalBody,
    ModalFooter,
    ModalContent,
    ModalCloseButton,
    ModalOverlay,
    Drawer,
    DrawerBody,
    DrawerHeader,
    DrawerOverlay,
    DrawerContent,
    DrawerCloseButton,
    Spinner
} from '@chakra-ui/react'

// Project Components
import Pagination from '../../components/pagination'
import ProductTile, {Skeleton as ProductTileSkeleton} from '../../components/product-tile'
import {HideOnDesktop} from '../../components/responsive'
import Refinements from './partials/refinements'
import SelectedRefinements from './partials/selected-refinements'
import EmptySearchResults from './partials/empty-results'
import PageHeader from './partials/page-header'
import ProductViewModal from '../../components/product-view-modal';

// Icons
import {FilterIcon, ChevronDownIcon} from '../../components/icons'

// Hooks
import {useLimitUrls, usePageUrls, useSortUrls, useSearchParams} from '../../hooks'
import {useToast} from '../../hooks/use-toast'
import useWishlist from '../../hooks/use-wishlist'
import {parse as parseSearchParams} from '../../hooks/use-search-params'
import useEinstein from '../../commerce-api/hooks/useEinstein'
import { useCommerceAPI } from '../../commerce-api/contexts'

// Others
import {HTTPNotFound} from 'pwa-kit-react-sdk/ssr/universal/errors'

// Constants
import {
    DEFAULT_LIMIT_VALUES,
    API_ERROR_MESSAGE,
    MAX_CACHE_AGE,
    TOAST_ACTION_VIEW_WISHLIST,
    TOAST_MESSAGE_ADDED_TO_WISHLIST,
    TOAST_MESSAGE_REMOVED_FROM_WISHLIST
} from '../../constants'
import useNavigation from '../../hooks/use-navigation'
import LoadingSpinner from '../../components/loading-spinner'
import useBasket from '../../commerce-api/hooks/useBasket'

// NOTE: You can ignore certain refinements on a template level by updating the below
// list of ignored refinements.
const REFINEMENT_DISALLOW_LIST = ['c_isNew']

/*
 * This is a simple product listing page. It displays a paginated list
 * of product hit objects. Allowing for sorting and filtering based on the
 * allowable filters and sort refinements.
 */
const ProductList = (props) => {
    const {
        searchQuery,
        productSearchResultInitial,
        category,
        // eslint-disable-next-line react/prop-types
        staticContext,
        location,
        isLoading,
        ...rest
    } = props
    const [productSearchResult, setProductSearchResult] = useState({})
    const {total, sortingOptions} = productSearchResult || {}
    const {isOpen, onOpen, onClose} = useDisclosure()
    const [isLoadingMore, setLoadingMoreState] = useState(false)
    const [sortOpen, setSortOpen] = useState(false)
    const [quickView, setQuickViewState] = useState();
    const [isQuickViewLoading, setQuickViewLoading] = useState(false);
    const basket = useBasket()
    const {formatMessage} = useIntl()
    const navigate = useNavigation()
    const history = useHistory()
    const params = useParams()
    const toast = useToast()
    const einstein = useEinstein()
    const api = useCommerceAPI()

    const basePath = `${location.pathname}${location.search}`
    // Reset scroll position when `isLoaded` becomes `true`.
    useEffect(() => {
        isLoading && window.scrollTo(0, 0)
        setFiltersLoading(isLoading)
    }, [isLoading])

    //Startup the state of the productSearchResult
    useEffect(() => {
        setProductSearchResult(productSearchResultInitial || {});
    }, [productSearchResultInitial])

    // Get urls to be used for pagination, page size changes, and sorting.
    const pageUrls = usePageUrls({total})
    const sortUrls = useSortUrls({options: sortingOptions})
    const limitUrls = useLimitUrls()

    // If we are loaded and still have no products, show the no results component.
    const showNoResults = !isLoading && productSearchResult && !productSearchResult?.hits

    /**************** Wishlist ****************/
    const wishlist = useWishlist()
    // keep track of the items has been add/remove to/from wishlist
    const [wishlistLoading, setWishlistLoading] = useState([])
    // TODO: DRY this handler when intl provider is available globally
    const addItemToWishlist = async (product) => {
        try {
            setWishlistLoading([...wishlistLoading, product.productId])
            await wishlist.createListItem({
                id: product.productId,
                quantity: 1
            })
            toast({
                title: formatMessage(TOAST_MESSAGE_ADDED_TO_WISHLIST, {quantity: 1}),
                status: 'success',
                action: (
                    // it would be better if we could use <Button as={Link}>
                    // but unfortunately the Link component is not compatible
                    // with Chakra Toast, since the ToastManager is rendered via portal
                    // and the toast doesn't have access to intl provider, which is a
                    // requirement of the Link component.
                    <Button variant="link" onClick={() => navigate('/account/wishlist')}>
                        {formatMessage(TOAST_ACTION_VIEW_WISHLIST)}
                    </Button>
                )
            })
        } catch {
            toast({
                title: formatMessage(API_ERROR_MESSAGE),
                status: 'error'
            })
        } finally {
            setWishlistLoading(wishlistLoading.filter((id) => id !== product.productId))
        }
    }

    // TODO: DRY this handler when intl provider is available globally
    const removeItemFromWishlist = async (product) => {
        try {
            setWishlistLoading([...wishlistLoading, product.productId])
            await wishlist.removeListItemByProductId(product.productId)
            toast({
                title: formatMessage(TOAST_MESSAGE_REMOVED_FROM_WISHLIST),
                status: 'success'
            })
        } catch {
            toast({
                title: formatMessage(API_ERROR_MESSAGE),
                status: 'error'
            })
        } finally {
            setWishlistLoading(wishlistLoading.filter((id) => id !== product.productId))
        }
    }

    /**************** Einstein ****************/
    useEffect(() => {
        if (productSearchResult) {
            searchQuery
                ? einstein.sendViewSearch(searchQuery, productSearchResult)
                : einstein.sendViewCategory(category, productSearchResult)
        }
    }, [productSearchResult])

    /**************** Filters ****************/
    const [searchParams, {stringify: stringifySearchParams}] = useSearchParams()
    const [filtersLoading, setFiltersLoading] = useState(false)

    // Toggles filter on and off
    const toggleFilter = (value, attributeId, selected, allowMultiple = true) => {
        const searchParamsCopy = {...searchParams}

        // Remove the `offset` search param if present.
        delete searchParamsCopy.offset

        // If we aren't allowing for multiple selections, simply clear any value set for the
        // attribute, and apply a new one if required.
        if (!allowMultiple) {
            delete searchParamsCopy.refine[attributeId]

            if (!selected) {
                searchParamsCopy.refine[attributeId] = value.value
            }
        } else {
            // Get the attibute value as an array.
            let attributeValue = searchParamsCopy.refine[attributeId] || []
            let values = Array.isArray(attributeValue) ? attributeValue : attributeValue.split('|')

            // Either set the value, or filter the value out.
            if (!selected) {
                values.push(value.value)
            } else {
                values = values?.filter((v) => v !== value.value)
            }

            // Update the attribute value in the new search params.
            searchParamsCopy.refine[attributeId] = values

            // If the update value is an empty array, remove the current attribute key.
            if (searchParamsCopy.refine[attributeId].length === 0) {
                delete searchParamsCopy.refine[attributeId]
            }
        }

        if (!searchQuery) {
            navigate(`/category/${params.categoryId}?${stringifySearchParams(searchParamsCopy)}`)
        } else {
            navigate(`/search?${stringifySearchParams(searchParamsCopy)}`)
        }
    }

    // On click of the Load More button, request the next products from the list
    const loadMoreProducts = () => {
        console.log(productSearchResult)

        if (productSearchResult.offset + productSearchResult.limit >= productSearchResult.total) {
            //Already loaded all the elements
            return
        }

        setLoadingMoreState(true)
        // const searchParams = parseSearchParams(location.search, false)
        const loadMoreParams = Object.assign({}, searchParams)
        loadMoreParams.offset = productSearchResult.offset + productSearchResult.limit

        if(loadMoreParams.refine && Object.keys(loadMoreParams.refine).length === 0 && loadMoreParams.refine.constructor === Object && category) {
            loadMoreParams.refine = [`cgid=${category.id}`]
        } else if (loadMoreParams.refine && !loadMoreParams.refine?.includes(`cgid=${category}`) && category) {
            loadMoreParams.refine.push(`cgid=${category.id}`)
        }

        api.shopperSearch.productSearch({
            parameters: loadMoreParams
        }).then((moreProducts) => {
            const newResearchResult = Object.assign({}, productSearchResult)
            newResearchResult.hits.push(...moreProducts.hits);
            newResearchResult.offset = moreProducts.offset;
            newResearchResult.refinements = moreProducts.refinements;
            setProductSearchResult(newResearchResult)
        }).catch((error) => {
            console.error('error', error)
        }).finally(() => {
            setLoadingMoreState(false)
        })
    }

    const handleQuickViewOpening = async (productID) => {
        setQuickViewLoading(true)
        try {
            const quickViewProduct = await api.shopperProducts.getProduct({
                parameters: {
                    id: productID,
                    allImages: true
                }
            })
            setQuickViewState(quickViewProduct);
        } catch(error){
            console.error('error', error)
        }
        setQuickViewLoading(false)
    }

    const handleAddToCart = async (productSelectionValues) => {
        try {
            const productItems = productSelectionValues.map(({variant, quantity}) => ({
                productId: variant.productId,
                price: variant.price,
                quantity
            }))

            await basket.addItemToBasket(productItems)

            // If the items were sucessfully added, set the return value to be used
            // by the add to cart modal.
            return productSelectionValues
        } catch (error) {
            console.error('error', error)
        }
    }

    // Clears all filters
    const resetFilters = () => {
        navigate(window.location.pathname)
    }

    let selectedSortingOptionLabel = productSearchResult?.sortingOptions?.find(
        (option) => option.id === productSearchResult?.selectedSortingOption
    )

    // API does not always return a selected sorting order
    if (!selectedSortingOptionLabel) {
        selectedSortingOptionLabel = productSearchResult?.sortingOptions?.[0]
    }

    return (
        <Box
            className="sf-product-list-page"
            data-testid="sf-product-list-page"
            layerStyle="page"
            paddingTop={{base: 6, lg: 8}}
            {...rest}
        >
            <Helmet>
                <title>{category?.pageTitle}</title>
                <meta name="description" content={category?.pageDescription} />
                <meta name="keywords" content={category?.pageKeywords} />
            </Helmet>
            {showNoResults ? (
                <EmptySearchResults searchQuery={searchQuery} category={category} />
            ) : (
                <>
                    {/* Header */}

                    <Stack
                        display={{base: 'none', lg: 'flex'}}
                        direction="row"
                        justify="flex-start"
                        align="flex-start"
                        spacing={4}
                        marginBottom={6}
                    >
                        <Flex align="left" width="287px">
                            <PageHeader
                                searchQuery={searchQuery}
                                category={category}
                                productSearchResult={productSearchResult}
                                isLoading={isLoading}
                            />
                        </Flex>

                        <Box flex={1} paddingTop={'45px'}>
                            <SelectedRefinements
                                filters={productSearchResult?.refinements}
                                toggleFilter={toggleFilter}
                                selectedFilterValues={productSearchResult?.selectedRefinements}
                            />
                        </Box>
                        <Box paddingTop={'45px'}>
                            <Sort
                                sortUrls={sortUrls}
                                productSearchResult={productSearchResult}
                                basePath={basePath}
                            />
                        </Box>
                    </Stack>

                    <HideOnDesktop>
                        <Stack spacing={6}>
                            <PageHeader
                                searchQuery={searchQuery}
                                category={category}
                                productSearchResult={productSearchResult}
                                isLoading={isLoading}
                            />
                            <Stack
                                display={{base: 'flex', md: 'none'}}
                                direction="row"
                                justify="flex-start"
                                align="center"
                                spacing={1}
                                height={12}
                                borderColor="gray.100"
                            >
                                <Flex align="center">
                                    <Button
                                        fontSize="sm"
                                        colorScheme="black"
                                        variant="outline"
                                        marginRight={2}
                                        display="inline-flex"
                                        leftIcon={<FilterIcon boxSize={5} />}
                                        onClick={onOpen}
                                    >
                                        <FormattedMessage
                                            defaultMessage="Filter"
                                            id="product_list.button.filter"
                                        />
                                    </Button>
                                </Flex>
                                <Flex align="center">
                                    <Button
                                        maxWidth="245px"
                                        fontSize="sm"
                                        marginRight={2}
                                        colorScheme="black"
                                        variant="outline"
                                        display="inline-flex"
                                        rightIcon={<ChevronDownIcon boxSize={5} />}
                                        onClick={() => setSortOpen(true)}
                                    >
                                        {formatMessage(
                                            {
                                                id: 'product_list.button.sort_by',
                                                defaultMessage: 'Sort By: {sortOption}'
                                            },
                                            {
                                                sortOption: selectedSortingOptionLabel?.label
                                            }
                                        )}
                                    </Button>
                                </Flex>
                            </Stack>
                        </Stack>
                        <Box marginBottom={4}>
                            <SelectedRefinements
                                filters={productSearchResult?.refinements}
                                toggleFilter={toggleFilter}
                                selectedFilterValues={productSearchResult?.selectedRefinements}
                            />
                        </Box>
                    </HideOnDesktop>

                    {/* Body  */}
                    <Grid templateColumns={{base: '1fr', md: '280px 1fr'}} columnGap={6}>
                        <Stack display={{base: 'none', md: 'flex'}}>
                            <Refinements
                                isLoading={filtersLoading}
                                toggleFilter={toggleFilter}
                                filters={productSearchResult?.refinements}
                                selectedFilters={searchParams.refine}
                            />
                        </Stack>
                        <Box>
                            <SimpleGrid
                                columns={[2, 2, 3, 3]}
                                spacingX={4}
                                spacingY={{base: 12, lg: 16}}
                            >
                                {isLoading || !productSearchResult
                                    ? new Array(searchParams.limit)
                                          .fill(0)
                                          .map((value, index) => (
                                              <ProductTileSkeleton key={index} />
                                          ))
                                    : productSearchResult.hits.map((productSearchItem) => {
                                          const productId = productSearchItem.productId
                                          const isInWishlist =
                                              !!wishlist.findItemByProductId(productId)

                                          return (
                                              <ProductTile
                                                  data-testid={`sf-product-tile-${productSearchItem.productId}`}
                                                  key={productSearchItem.productId}
                                                  product={productSearchItem}
                                                  enableFavourite={true}
                                                  openQuickView={handleQuickViewOpening}
                                                  isFavourite={isInWishlist}
                                                  onClick={() => {
                                                      if (searchQuery) {
                                                          einstein.sendClickSearch(
                                                              searchQuery,
                                                              productSearchItem
                                                          )
                                                      } else if (category) {
                                                          einstein.sendClickCategory(
                                                              category,
                                                              productSearchItem
                                                          )
                                                      }
                                                  }}
                                                  onFavouriteToggle={(isFavourite) => {
                                                      const action = isFavourite
                                                          ? addItemToWishlist
                                                          : removeItemFromWishlist
                                                      return action(productSearchItem)
                                                  }}
                                                  dynamicImageProps={{
                                                      widths: [
                                                          '50vw',
                                                          '50vw',
                                                          '20vw',
                                                          '20vw',
                                                          '25vw'
                                                      ]
                                                  }}
                                              />
                                          )
                                      })}
                            </SimpleGrid>
                            {/* Footer */}
                            <Flex
                                justifyContent={['center', 'center', 'flex-start']}
                                paddingTop={8}
                            >
                                {isLoadingMore && <Spinner />}
                                <Button onClick={loadMoreProducts}>Show More</Button>
                                {/*<Pagination currentURL={basePath} urls={pageUrls} />*/}

                                {/*
                            Our design doesn't call for a page size select. Show this element if you want
                            to add one to your design.
                        */}
                                <Select
                                    display="none"
                                    value={basePath}
                                    onChange={({target}) => {
                                        history.push(target.value)
                                    }}
                                >
                                    {limitUrls.map((href, index) => (
                                        <option key={href} value={href}>
                                            {DEFAULT_LIMIT_VALUES[index]}
                                        </option>
                                    ))}
                                </Select>
                            </Flex>
                        </Box>
                    </Grid>
                </>
            )}

            {isQuickViewLoading && <LoadingSpinner />}
            {quickView && <ProductViewModal
                isOpen={!!quickView}
                onOpen={() => {}}
                onClose={() => setQuickViewState(null)}
                product={quickView}
                addToCart={(variant, quantity) => handleAddToCart([{product: quickView, variant, quantity}])}
            />}

            <Modal
                isOpen={isOpen}
                onClose={onClose}
                size="full"
                motionPreset="slideInBottom"
                scrollBehavior="inside"
            >
                <ModalOverlay />
                <ModalContent top={0} marginTop={0}>
                    <ModalHeader>
                        <Text fontWeight="bold" fontSize="2xl">
                            <FormattedMessage
                                defaultMessage="Filter"
                                id="product_list.modal.title.filter"
                            />
                        </Text>
                    </ModalHeader>
                    <ModalCloseButton />
                    <ModalBody py={4}>
                        {filtersLoading && <LoadingSpinner />}
                        <Refinements
                            toggleFilter={toggleFilter}
                            filters={productSearchResult?.refinements}
                            selectedFilters={productSearchResult?.selectedRefinements}
                        />
                    </ModalBody>

                    <ModalFooter
                        // justify="space-between"
                        display="block"
                        width="full"
                        borderTop="1px solid"
                        borderColor="gray.100"
                        paddingBottom={10}
                    >
                        <Stack>
                            <Button width="full" onClick={onClose}>
                                {formatMessage(
                                    {
                                        id: 'product_list.modal.button.view_items',
                                        defaultMessage: 'View {prroductCount} items'
                                    },
                                    {
                                        prroductCount: productSearchResult?.total
                                    }
                                )}
                            </Button>
                            <Button width="full" variant="outline" onClick={() => resetFilters()}>
                                <FormattedMessage
                                    defaultMessage="Clear Filters"
                                    id="product_list.modal.button.clear_filters"
                                />
                            </Button>
                        </Stack>
                    </ModalFooter>
                </ModalContent>
            </Modal>
            <Drawer
                placement="bottom"
                isOpen={sortOpen}
                onClose={() => setSortOpen(false)}
                size="sm"
                motionPreset="slideInBottom"
                scrollBehavior="inside"
                isFullHeight={false}
                height="50%"
            >
                <DrawerOverlay />
                <DrawerContent marginTop={0}>
                    <DrawerHeader boxShadow="none">
                        <Text fontWeight="bold" fontSize="2xl">
                            <FormattedMessage
                                defaultMessage="Sort By"
                                id="product_list.drawer.title.sort_by"
                            />
                        </Text>
                    </DrawerHeader>
                    <DrawerCloseButton />
                    <DrawerBody>
                        {sortUrls.map((href, idx) => (
                            <Button
                                width="full"
                                onClick={() => {
                                    setSortOpen(false)
                                    history.push(href)
                                }}
                                fontSize={'md'}
                                key={idx}
                                marginTop={0}
                                variant="menu-link"
                            >
                                <Text
                                    as={
                                        selectedSortingOptionLabel?.label ===
                                            productSearchResult?.sortingOptions[idx]?.label && 'u'
                                    }
                                >
                                    {productSearchResult?.sortingOptions[idx]?.label}
                                </Text>
                            </Button>
                        ))}
                    </DrawerBody>
                </DrawerContent>
            </Drawer>
        </Box>
    )
}

ProductList.getTemplateName = () => 'product-list'

ProductList.shouldGetProps = ({previousLocation, location}) =>
    !previousLocation ||
    previousLocation.pathname !== location.pathname ||
    previousLocation.search !== location.search

ProductList.getProps = async ({res, params, location, api}) => {
    const {categoryId} = params
    const urlParams = new URLSearchParams(location.search)
    let searchQuery = urlParams.get('q')
    let isSearch = false

    if (searchQuery) {
        isSearch = true
    }
    // In case somebody navigates to /search without a param
    if (!categoryId && !isSearch) {
        // We will simulate search for empty string
        return {searchQuery: ' ', productSearchResult: {}}
    }

    const searchParams = parseSearchParams(location.search, false)

    if (!searchParams.refine.includes(`cgid=${categoryId}`) && categoryId) {
        searchParams.refine.push(`cgid=${categoryId}`)
    }

    // Set the `cache-control` header values to align with the Commerce API settings.
    if (res) {
        res.set('Cache-Control', `max-age=${MAX_CACHE_AGE}`)
    }

    const [category, productSearchResult] = await Promise.all([
        isSearch
            ? Promise.resolve()
            : api.shopperProducts.getCategory({
                  parameters: {id: categoryId, levels: 0}
              }),
        api.shopperSearch.productSearch({
            parameters: searchParams
        })
    ])

    // Apply disallow list to refinements.
    productSearchResult.refinements = productSearchResult?.refinements?.filter(
        ({attributeId}) => !REFINEMENT_DISALLOW_LIST.includes(attributeId)
    )

    // The `isomorphic-sdk` returns error objects when they occur, so we
    // need to check the category type and throw if required.
    if (category?.type?.endsWith('category-not-found')) {
        throw new HTTPNotFound(category.detail)
    }

    return {searchQuery: searchQuery, productSearchResultInitial: productSearchResult, category}
}

ProductList.propTypes = {
    /**
     * The search result object showing all the product hits, that belong
     * in the supplied category.
     */
    productSearchResultInitial: PropTypes.object,
    /*
     * Indicated that `getProps` has been called but has yet to complete.
     *
     * Notes: This prop is internally provided.
     */
    isLoading: PropTypes.bool,
    /*
     * Object that represents the current location, it consists of the `pathname`
     * and `search` values.
     *
     * Notes: This prop is internally provided.
     */
    location: PropTypes.object,
    searchQuery: PropTypes.string,
    onAddToWishlistClick: PropTypes.func,
    onRemoveWishlistClick: PropTypes.func,
    category: PropTypes.object
}

export default ProductList

const Sort = ({sortUrls, productSearchResult, basePath, ...otherProps}) => {
    const intl = useIntl()
    const history = useHistory()

    return (
        <FormControl data-testid="sf-product-list-sort" id="page_sort" width="auto" {...otherProps}>
            <Select
                value={basePath.replace(/(offset)=(\d+)/i, '$1=0')}
                onChange={({target}) => {
                    history.push(target.value)
                }}
                height={11}
                width="240px"
            >
                {sortUrls.map((href, index) => (
                    <option key={href} value={href}>
                        {intl.formatMessage(
                            {
                                id: 'product_list.select.sort_by',
                                defaultMessage: 'Sort By: {sortOption}'
                            },
                            {
                                sortOption: productSearchResult?.sortingOptions[index]?.label
                            }
                        )}
                    </option>
                ))}
            </Select>
        </FormControl>
    )
}
Sort.propTypes = {
    sortUrls: PropTypes.array,
    productSearchResult: PropTypes.object,
    basePath: PropTypes.string
}
